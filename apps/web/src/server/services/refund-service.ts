/**
 * Refunds (D51). When a paid entry is withdrawn or cancelled, a Refund is created per paid
 * order item: executed straight away for AUTOMATIC_BEFORE_DEADLINE or organiser cancellations,
 * otherwise it waits for an admin (ADMIN_APPROVAL). Stripe payments are refunded through the
 * gateway; manual (desk) payments are marked refunded when an admin confirms they paid back.
 */
import { prisma, type Prisma, type RefundStatus } from '@tourneasy/db';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { formatEuro } from '@tourneasy/shared';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { getGateway } from '../payments/gateway';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';

const refundSelect = {
  id: true,
  status: true,
  amountCents: true,
  stripeRefundId: true,
  orderItemId: true,
  payment: {
    select: {
      id: true,
      stripePaymentIntentId: true,
      method: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          totalCents: true,
          tournament: { select: { name: true } },
          user: { select: { email: true, name: true, locale: true } },
          items: { select: { amountCents: true, refundedCents: true } },
        },
      },
    },
  },
  orderItem: { select: { id: true, participantId: true, amountCents: true, refundedCents: true } },
} satisfies Prisma.RefundSelect;

type Tx = Prisma.TransactionClient;

/** Creates refunds for the paid shares of a cancelled registration. */
export async function refundsForCancelledRegistration(
  registrationId: string,
  mode: 'policy' | 'full',
  requestedById: string | null,
  meta?: RequestMeta,
) {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: {
      event: {
        select: { tournament: { select: { refundPolicy: true, refundPercent: true } } },
      },
      orderItems: {
        where: { order: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
        select: {
          id: true,
          amountCents: true,
          refundedCents: true,
          refunds: {
            where: { status: { in: ['REQUESTED', 'APPROVED', 'PENDING'] } },
            select: { id: true },
          },
          order: {
            select: { payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 } },
          },
        },
      },
    },
  });
  const { refundPolicy, refundPercent } = registration.event.tournament;
  if (mode === 'policy' && refundPolicy === 'NO_REFUNDS') return [];
  const percent = mode === 'full' ? 100 : refundPercent;
  const created: string[] = [];
  for (const item of registration.orderItems) {
    const payment = item.order.payments[0];
    const open = item.amountCents - item.refundedCents;
    if (!payment || open <= 0 || item.refunds.length > 0) continue;
    const amountCents = Math.round((open * percent) / 100);
    if (amountCents <= 0) continue;
    const refund = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        orderItemId: item.id,
        amountCents,
        status: 'REQUESTED',
        reason: mode === 'full' ? 'cancelledByOrganiser' : 'withdrawn',
        requestedById,
      },
    });
    created.push(refund.id);
    await writeAudit(prisma, {
      actorId: requestedById,
      action: 'refund.request',
      entityType: 'Refund',
      entityId: refund.id,
      after: { amountCents, registrationId },
      meta,
    });
  }
  if (mode === 'full' || refundPolicy === 'AUTOMATIC_BEFORE_DEADLINE') {
    for (const id of created) await executeRefund(id, requestedById, meta);
  } else {
    for (const id of created) await notifyRefund(id, 'requested');
  }
  return created;
}

/** Sends the money back (Stripe) or records a manual pay-back, then updates the order. */
export async function executeRefund(
  refundId: string,
  processedById: string | null,
  meta?: RequestMeta,
) {
  const refund = await prisma.refund.findUniqueOrThrow({
    where: { id: refundId },
    select: refundSelect,
  });
  if (!['REQUESTED', 'APPROVED'].includes(refund.status)) throw new AppError('statusTransition');
  let status: RefundStatus = 'SUCCEEDED';
  let stripeRefundId: string | null = null;
  if (refund.payment.stripePaymentIntentId) {
    const gateway = await getGateway();
    if (!gateway) throw new AppError('paymentsUnavailable');
    const result = await gateway.refund({
      paymentIntentId: refund.payment.stripePaymentIntentId,
      amountCents: refund.amountCents,
      idempotencyKey: `refund-${refund.id}`,
      metadata: { refundId: refund.id, orderNumber: refund.payment.order.orderNumber },
    });
    stripeRefundId = result.id;
    status =
      result.status === 'succeeded'
        ? 'SUCCEEDED'
        : result.status === 'failed'
          ? 'FAILED'
          : 'PENDING';
  }
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refund.id },
      data: { status, stripeRefundId, processedById, processedAt: new Date() },
    });
    if (status === 'SUCCEEDED') await bookRefund(tx, refund.id);
    await writeAudit(tx, {
      actorId: processedById,
      action: 'refund.execute',
      entityType: 'Refund',
      entityId: refund.id,
      after: { status, amountCents: refund.amountCents },
      meta,
    });
  });
  if (status === 'SUCCEEDED') await notifyRefund(refund.id, 'processed');
  return status;
}

/** Books a successful refund on the order item, participant and order. */
async function bookRefund(tx: Tx, refundId: string) {
  const refund = await tx.refund.findUniqueOrThrow({
    where: { id: refundId },
    select: refundSelect,
  });
  if (refund.orderItem) {
    const item = await tx.orderItem.update({
      where: { id: refund.orderItem.id },
      data: { refundedCents: { increment: refund.amountCents } },
    });
    if (item.refundedCents >= item.amountCents) {
      await tx.registrationParticipant.update({
        where: { id: refund.orderItem.participantId },
        data: { paymentStatus: 'REFUNDED' },
      });
    }
  }
  const items = await tx.orderItem.findMany({
    where: { orderId: refund.payment.order.id },
    select: { amountCents: true, refundedCents: true },
  });
  const refunded = items.reduce((n, i) => n + i.refundedCents, 0);
  const total = items.reduce((n, i) => n + i.amountCents, 0);
  await tx.order.update({
    where: { id: refund.payment.order.id },
    data: { status: refunded >= total ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
  });
}

/** Webhook: a Stripe refund changed status (e.g. a pending iDEAL refund completed). */
export async function applyRefundUpdate(
  stripeRefundId: string,
  status: 'pending' | 'succeeded' | 'failed',
) {
  const refund = await prisma.refund.findUnique({
    where: { stripeRefundId },
    select: { id: true, status: true },
  });
  if (!refund || refund.status === 'SUCCEEDED' || refund.status === 'FAILED') return;
  if (status === 'pending') return;
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refund.id },
      data: { status: status === 'succeeded' ? 'SUCCEEDED' : 'FAILED', processedAt: new Date() },
    });
    if (status === 'succeeded') await bookRefund(tx, refund.id);
  });
  if (status === 'succeeded') await notifyRefund(refund.id, 'processed');
}

export async function approveRefund(actor: Actor, refundId: string, meta: RequestMeta) {
  assertAdmin(actor);
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    select: { status: true },
  });
  if (!refund) throw new AppError('notFound');
  if (refund.status !== 'REQUESTED') throw new AppError('statusTransition');
  await prisma.refund.update({ where: { id: refundId }, data: { status: 'APPROVED' } });
  return executeRefund(refundId, actor.userId, meta);
}

export async function rejectRefund(actor: Actor, refundId: string, meta: RequestMeta) {
  assertAdmin(actor);
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    select: { status: true },
  });
  if (!refund) throw new AppError('notFound');
  if (refund.status !== 'REQUESTED') throw new AppError('statusTransition');
  await prisma.refund.update({
    where: { id: refundId },
    data: { status: 'REJECTED', processedById: actor.userId, processedAt: new Date() },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'refund.reject',
    entityType: 'Refund',
    entityId: refundId,
    meta,
  });
  await notifyRefund(refundId, 'rejected');
}

async function notifyRefund(refundId: string, kind: 'requested' | 'processed' | 'rejected') {
  const refund = await prisma.refund.findUniqueOrThrow({
    where: { id: refundId },
    select: refundSelect,
  });
  const user = refund.payment.order.user;
  const locale = user.locale as AppLocale;
  await sendMailSafely(
    renderEmail(user.email, locale, {
      kind: 'refund',
      state: kind,
      name: user.name.split(' ')[0] ?? user.name,
      tournament: refund.payment.order.tournament.name,
      amount: formatEuro(refund.amountCents, locale),
      orderNumber: refund.payment.order.orderNumber,
      url: appUrl(locale, '/account?tab=upcoming'),
    }),
  );
}
