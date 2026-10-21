/**
 * Online payment of entry fees (Phase 5, D51): one Order per checkout (a player's unpaid shares
 * in one tournament), paid with a Stripe PaymentIntent. The webhook is the source of truth;
 * `reconcileOrder` asks Stripe directly so the result page is right even before the webhook
 * arrives. Applying a payment is idempotent.
 */
import { Prisma, prisma, type OrderStatus, type PaymentMethod } from '@tourneasy/db';
import { checkoutSchema, formatEuro, manualPaymentSchema } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { parseInput } from '../lib/validation';
import {
  getGateway,
  type GatewayEvent,
  type GatewayIntent,
  type PaymentGateway,
} from '../payments/gateway';
import { amountsDue, HOLD_MINUTES } from '../payments/pricing';
import { assertAdmin, assertCanManageTournament } from './permissions';
import { refundsForCancelledRegistration, applyRefundUpdate } from './refund-service';
import { eventText, fullName } from './registration-service';
import type { Actor } from './session-service';

async function requireGateway(): Promise<PaymentGateway> {
  const gateway = await getGateway();
  if (!gateway) throw new AppError('paymentsUnavailable');
  return gateway;
}

async function nextOrderNumber(tx: Prisma.TransactionClient, now: Date) {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
  return `${now.getUTCFullYear()}-${String(row!.n).padStart(6, '0')}`;
}

const shareSelect = {
  id: true,
  role: true,
  active: true,
  paymentStatus: true,
  playerId: true,
  player: { select: { firstName: true, lastNamePrefix: true, lastName: true, userId: true } },
  registration: {
    select: {
      id: true,
      status: true,
      holdExpiresAt: true,
      event: {
        select: {
          id: true,
          discipline: true,
          name: true,
          feeCents: true,
          ageCategory: { select: { code: true, name: true } },
          levelClass: { select: { code: true } },
          tournament: { select: { id: true, name: true, partnerPaymentMode: true, endsOn: true } },
        },
      },
    },
  },
} satisfies Prisma.RegistrationParticipantSelect;
type ShareRow = Prisma.RegistrationParticipantGetPayload<{ select: typeof shareSelect }>;

// ── Checkout ───────────────────────────────────────────────────────────────────────

export async function createCheckout(actor: Actor, input: unknown, now = new Date()) {
  const gateway = await requireGateway();
  const { participantIds } = parseInput(checkoutSchema, input);
  const me = await prisma.playerProfile.findFirst({
    where: { userId: actor.userId, deletedAt: null },
    select: { id: true, user: { select: { email: true, locale: true } } },
  });
  if (!me) throw new AppError('noPlayerProfile');
  const shares = await prisma.registrationParticipant.findMany({
    where: { id: { in: [...new Set(participantIds)] } },
    select: shareSelect,
  });
  const payable = (s: ShareRow) =>
    s.playerId === me.id &&
    s.active &&
    s.paymentStatus === 'UNPAID' &&
    (s.registration.status === 'PENDING' || s.registration.status === 'CONFIRMED') &&
    s.registration.event.feeCents > 0;
  if (shares.length !== new Set(participantIds).size || !shares.every(payable))
    throw new AppError('validation', { fields: { participantIds: 'invalid' } });
  const tournamentIds = new Set(shares.map((s) => s.registration.event.tournament.id));
  if (tournamentIds.size !== 1)
    throw new AppError('validation', { fields: { participantIds: 'invalid' } });
  const tournament = shares[0]!.registration.event.tournament;

  // Re-opening the payment window reuses the open order for the same shares.
  const open = await prisma.order.findFirst({
    where: {
      userId: actor.userId,
      tournamentId: tournament.id,
      status: 'PENDING',
      expiresAt: { gt: now },
      items: { every: { participantId: { in: participantIds } } },
    },
    select: {
      id: true,
      orderNumber: true,
      totalCents: true,
      items: { select: { participantId: true } },
      payments: {
        where: { status: { in: ['REQUIRES_PAYMENT', 'PROCESSING'] } },
        select: { stripePaymentIntentId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (open && open.items.length === shares.length && open.payments[0]?.stripePaymentIntentId) {
    const intent = await gateway.retrieveIntent(open.payments[0].stripePaymentIntentId);
    if (intent.status === 'requires_payment' && intent.clientSecret) {
      return {
        orderId: open.id,
        orderNumber: open.orderNumber,
        amountCents: open.totalCents,
        clientSecret: intent.clientSecret,
        publishableKey: gateway.publishableKey,
      };
    }
  }

  // Amounts include the multi-category discount (D52).
  const due = await amountsDue(me.id, tournament.id);
  const lines = shares.map((s) => ({
    participantId: s.id,
    registrationId: s.registration.id,
    amountCents: due.get(s.id) ?? s.registration.event.feeCents,
    description: `${eventText(s.registration.event, actor.locale)} · ${fullName(s.player)}`,
  }));
  const total = lines.reduce((n, l) => n + l.amountCents, 0);
  if (total === 0) {
    // Fully covered by the discount: nothing to pay online.
    await settleWithoutPayment(lines, now);
    return {
      orderId: null,
      orderNumber: null,
      amountCents: 0,
      clientSecret: null,
      publishableKey: gateway.publishableKey,
    };
  }
  // The order lives as long as the shortest hold among its entries (at least the hold time).
  const holds = shares
    .map((s) => s.registration.holdExpiresAt?.getTime())
    .filter((t): t is number => typeof t === 'number');
  const expiresAt = new Date(
    holds.length ? Math.min(...holds) : now.getTime() + HOLD_MINUTES * 60_000,
  );

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx, now),
        userId: actor.userId,
        tournamentId: tournament.id,
        subtotalCents: total,
        totalCents: total,
        expiresAt,
        idempotencyKey: crypto.randomUUID(),
        items: { create: lines },
      },
    });
    return created;
  });
  const intent = await gateway.createIntent({
    amountCents: total,
    description: `Tourneasy ${order.orderNumber} · ${tournament.name}`,
    metadata: { orderId: order.id, orderNumber: order.orderNumber },
    idempotencyKey: `order-${order.id}`,
    receiptEmail: me.user?.email,
  });
  await prisma.payment.create({
    data: { orderId: order.id, stripePaymentIntentId: intent.id, amountCents: total },
  });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountCents: total,
    clientSecret: intent.clientSecret!,
    publishableKey: gateway.publishableKey,
  };
}

/** Shares that cost nothing after the discount are confirmed without a payment. */
async function settleWithoutPayment(
  lines: { participantId: string; registrationId: string }[],
  now: Date,
) {
  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      await tx.registrationParticipant.update({
        where: { id: l.participantId },
        data: { paymentStatus: 'WAIVED' },
      });
      await tx.registration.updateMany({
        where: { id: l.registrationId, status: 'PENDING' },
        data: { status: 'CONFIRMED', confirmedAt: now, holdExpiresAt: null },
      });
    }
  });
}

/** Sum of what is still owed, per player and tournament so discounts are applied. */
async function outstandingTotal(shares: ShareRow[]) {
  const groups = new Map<string, { playerId: string; tournamentId: string; ids: string[] }>();
  for (const s of shares) {
    const key = `${s.playerId}:${s.registration.event.tournament.id}`;
    const g = groups.get(key) ?? {
      playerId: s.playerId,
      tournamentId: s.registration.event.tournament.id,
      ids: [],
    };
    g.ids.push(s.id);
    groups.set(key, g);
  }
  let total = 0;
  for (const g of groups.values()) {
    const due = await amountsDue(g.playerId, g.tournamentId);
    for (const id of g.ids) total += due.get(id) ?? 0;
  }
  return total;
}

// ── Applying payment results ───────────────────────────────────────────────────────

const METHOD: Record<string, PaymentMethod> = {
  IDEAL: 'IDEAL',
  CARD: 'CARD',
  BANCONTACT: 'BANCONTACT',
  OTHER: 'OTHER',
};

/** Brings our records in line with a PaymentIntent. Safe to call any number of times. */
export async function applyIntent(intent: GatewayIntent, now = new Date()) {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: intent.id },
    select: { id: true, status: true, orderId: true, order: { select: { status: true } } },
  });
  if (!payment) return null;
  if (intent.status === 'processing' && payment.status === 'REQUIRES_PAYMENT') {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PROCESSING' } });
    return 'PROCESSING';
  }
  if (intent.status === 'failed' || intent.status === 'canceled') {
    if (payment.status !== 'SUCCEEDED') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: intent.status === 'failed' ? 'FAILED' : 'CANCELED',
          failureReason: intent.lastError,
        },
      });
    }
    return 'FAILED';
  }
  if (intent.status !== 'succeeded' || payment.status === 'SUCCEEDED') return payment.status;

  const lateRegistrations: string[] = [];
  await prisma.$transaction(async (tx) => {
    // Lock the payment row so a webhook and a reconcile can't both book the payment.
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id}::uuid FOR UPDATE`;
    const fresh = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { status: true },
    });
    if (fresh.status === 'SUCCEEDED') return;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        method: intent.method ? METHOD[intent.method] : null,
        succeededAt: now,
      },
    });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: 'PAID', paidAt: now },
    });
    const items = await tx.orderItem.findMany({
      where: { orderId: payment.orderId },
      select: {
        participantId: true,
        registrationId: true,
        registration: {
          select: {
            status: true,
            event: {
              select: { discipline: true, tournament: { select: { partnerPaymentMode: true } } },
            },
          },
        },
        participant: { select: { role: true } },
      },
    });
    for (const item of items) {
      await tx.registrationParticipant.update({
        where: { id: item.participantId },
        data: { paymentStatus: 'PAID' },
      });
      const reg = item.registration;
      if (reg.status === 'PENDING') {
        await tx.registration.update({
          where: { id: item.registrationId },
          data: { status: 'CONFIRMED', confirmedAt: now, holdExpiresAt: null },
        });
      } else if (reg.status === 'CANCELLED') {
        // Paid after the hold lapsed: the place is gone, so the money goes back.
        lateRegistrations.push(item.registrationId);
      }
      // The entrant paid for both: the partner's share is covered.
      if (
        item.participant.role === 'PRIMARY' &&
        reg.event.tournament.partnerPaymentMode === 'INITIATOR_PAYS_ALL'
      ) {
        await tx.registrationParticipant.updateMany({
          where: { registrationId: item.registrationId, role: 'PARTNER', paymentStatus: 'UNPAID' },
          data: { paymentStatus: 'PAID_BY_PARTNER' },
        });
      }
    }
    await writeAudit(tx, {
      actorId: null,
      action: 'payment.succeeded',
      entityType: 'Order',
      entityId: payment.orderId,
      after: { amountCents: intent.amountCents, method: intent.method },
    });
  });
  for (const registrationId of lateRegistrations) {
    await refundsForCancelledRegistration(registrationId, 'full', null);
  }
  await sendReceipt(payment.orderId);
  return 'SUCCEEDED';
}

/** Asks the gateway for the current state of an order's payment and applies it. */
export async function reconcileOrder(orderId: string, actor: Actor | null) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      status: true,
      orderNumber: true,
      totalCents: true,
      tournament: { select: { name: true, slug: true } },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { stripePaymentIntentId: true },
      },
    },
  });
  if (!order || (actor && order.userId !== actor.userId)) throw new AppError('notFound');
  const gateway = await getGateway();
  const intentId = order.payments[0]?.stripePaymentIntentId;
  if (gateway && intentId && order.status === 'PENDING') {
    await applyIntent(await gateway.retrieveIntent(intentId));
  }
  const fresh = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
    },
  });
  return {
    orderNumber: order.orderNumber,
    totalCents: order.totalCents,
    tournament: order.tournament,
    status: fresh.status as OrderStatus,
    paymentStatus: fresh.payments[0]?.status ?? null,
  };
}

/** Stripe webhook: verified, recorded once (StripeEvent) and applied. */
export async function handleWebhook(rawBody: string, signature: string) {
  const gateway = await requireGateway();
  let event: GatewayEvent;
  try {
    event = gateway.parseWebhook(rawBody, signature);
  } catch {
    throw new AppError('validation', { fields: { signature: 'invalid' } });
  }
  const seen = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (seen?.processedAt) return { duplicate: true };
  if (!seen) {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type, payload: event.raw as Prisma.InputJsonValue },
    });
  }
  try {
    if (event.intent && event.type.startsWith('payment_intent.')) await applyIntent(event.intent);
    if (event.refund?.id && event.type.startsWith('refund.'))
      await applyRefundUpdate(event.refund.id, event.refund.status);
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: null },
    });
  } catch (error) {
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { error: error instanceof Error ? error.message.slice(0, 500) : 'error' },
    });
    throw error;
  }
  return { duplicate: false };
}

async function sendReceipt(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      totalCents: true,
      paidAt: true,
      tournament: { select: { name: true } },
      user: { select: { email: true, name: true, locale: true } },
      items: { select: { description: true, amountCents: true } },
      payments: { where: { status: 'SUCCEEDED' }, take: 1, select: { method: true } },
    },
  });
  const locale = order.user.locale as AppLocale;
  await sendMailSafely(
    renderEmail(order.user.email, locale, {
      kind: 'paymentReceipt',
      name: order.user.name.split(' ')[0] ?? order.user.name,
      tournament: order.tournament.name,
      orderNumber: order.orderNumber,
      lines: order.items.map((i) => `${i.description}: ${formatEuro(i.amountCents, locale)}`),
      total: formatEuro(order.totalCents, locale),
      method: order.payments[0]?.method ?? 'OTHER',
      url: appUrl(locale, '/account?tab=upcoming'),
    }),
  );
}

// ── Desk payments (organisers) ─────────────────────────────────────────────────────

/** Records a share as paid at the desk (cash, bank transfer): an order with a MANUAL payment. */
export async function markShareAsPaid(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  const { participantId } = parseInput(manualPaymentSchema, input);
  const share = await prisma.registrationParticipant.findUnique({
    where: { id: participantId },
    select: shareSelect,
  });
  if (!share) throw new AppError('notFound');
  const tournament = share.registration.event.tournament;
  await assertCanManageTournament(actor, tournament.id);
  if (share.paymentStatus !== 'UNPAID' || !share.active) throw new AppError('statusTransition');
  const amount =
    (await amountsDue(share.playerId, tournament.id)).get(share.id) ??
    share.registration.event.feeCents;
  const payer = share.player.userId ?? actor.userId;
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx, now),
        userId: payer,
        tournamentId: tournament.id,
        status: 'PAID',
        paidAt: now,
        subtotalCents: amount,
        totalCents: amount,
        expiresAt: now,
        idempotencyKey: crypto.randomUUID(),
        items: {
          create: {
            participantId: share.id,
            registrationId: share.registration.id,
            amountCents: amount,
            description: `${eventText(share.registration.event, 'nl')} · ${fullName(share.player)}`,
          },
        },
      },
    });
    await tx.payment.create({
      data: {
        orderId: order.id,
        amountCents: amount,
        status: 'SUCCEEDED',
        method: 'MANUAL',
        succeededAt: now,
        recordedById: actor.userId,
      },
    });
    await tx.registrationParticipant.update({
      where: { id: share.id },
      data: { paymentStatus: 'PAID' },
    });
    if (share.registration.status === 'PENDING') {
      await tx.registration.update({
        where: { id: share.registration.id },
        data: { status: 'CONFIRMED', confirmedAt: now, holdExpiresAt: null },
      });
    }
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'payment.manual',
      entityType: 'Order',
      entityId: order.id,
      after: { participantId: share.id, amountCents: amount },
      meta,
    });
  });
}

// ── Admin overview ─────────────────────────────────────────────────────────────────

export type PaymentFilters = { tournamentId?: string; status?: OrderStatus; page?: number };

export async function paymentsOverview(actor: Actor, filters: PaymentFilters = {}) {
  assertAdmin(actor);
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.OrderWhereInput = {
    ...(filters.tournamentId ? { tournamentId: filters.tournamentId } : {}),
    ...(filters.status ? { status: filters.status } : { status: { not: 'EXPIRED' } }),
  };
  const tournamentWhere = filters.tournamentId ? { tournamentId: filters.tournamentId } : {};
  const [orders, total, paid, refunded, outstanding, refundRequests] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 25,
      take: 25,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalCents: true,
        createdAt: true,
        paidAt: true,
        user: { select: { name: true, email: true } },
        tournament: { select: { id: true, name: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { method: true, status: true },
        },
        items: { select: { description: true, amountCents: true, refundedCents: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED', order: tournamentWhere },
      _sum: { amountCents: true },
    }),
    prisma.refund.aggregate({
      where: { status: 'SUCCEEDED', payment: { order: tournamentWhere } },
      _sum: { amountCents: true },
    }),
    prisma.registrationParticipant.findMany({
      where: {
        active: true,
        paymentStatus: 'UNPAID',
        registration: {
          status: { in: ['PENDING', 'CONFIRMED'] },
          event: {
            feeCents: { gt: 0 },
            ...(filters.tournamentId ? { tournamentId: filters.tournamentId } : {}),
          },
        },
      },
      select: shareSelect,
    }),
    prisma.refund.findMany({
      where: { status: 'REQUESTED', payment: { order: tournamentWhere } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        amountCents: true,
        reason: true,
        createdAt: true,
        payment: {
          select: {
            method: true,
            order: {
              select: {
                orderNumber: true,
                user: { select: { name: true, email: true } },
                tournament: { select: { name: true } },
              },
            },
          },
        },
        orderItem: { select: { description: true } },
      },
    }),
  ]);
  return {
    orders,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 25)),
    totals: {
      paidCents: paid._sum.amountCents ?? 0,
      refundedCents: refunded._sum.amountCents ?? 0,
      outstandingCents: await outstandingTotal(outstanding),
      outstandingShares: outstanding.length,
    },
    refundRequests,
  };
}

/** Paid and refunded orders as a table for the Excel export. */
export async function exportPayments(actor: Actor, filters: PaymentFilters) {
  assertAdmin(actor);
  const orders = await prisma.order.findMany({
    where: {
      ...(filters.tournamentId ? { tournamentId: filters.tournamentId } : {}),
      status: filters.status ?? { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
    },
    orderBy: { createdAt: 'asc' },
    take: 20_000,
    select: {
      orderNumber: true,
      status: true,
      paidAt: true,
      user: { select: { name: true, email: true } },
      tournament: { select: { name: true } },
      payments: { where: { status: 'SUCCEEDED' }, take: 1, select: { method: true } },
      items: { select: { description: true, amountCents: true, refundedCents: true } },
    },
  });
  const header = [
    'orderNumber',
    'tournament',
    'paidAt',
    'payer',
    'email',
    'method',
    'item',
    'amount',
    'refunded',
    'orderStatus',
  ];
  const rows = orders.flatMap((o) =>
    o.items.map((i) => [
      o.orderNumber,
      o.tournament.name,
      o.paidAt ? o.paidAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      o.user.name,
      o.user.email,
      o.payments[0]?.method ?? '',
      i.description,
      i.amountCents / 100,
      i.refundedCents / 100,
      o.status,
    ]),
  );
  return { header, rows };
}

/** Tournaments with an entry fee, for the payments filter. */
export async function paymentTournamentOptions(actor: Actor) {
  assertAdmin(actor);
  return prisma.tournament.findMany({
    where: { deletedAt: null, events: { some: { feeCents: { gt: 0 }, deletedAt: null } } },
    orderBy: { startsOn: 'desc' },
    take: 200,
    select: { id: true, name: true },
  });
}
