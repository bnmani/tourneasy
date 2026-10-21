import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import { FakeGateway, setGatewayForTests, type GatewayEvent } from '../payments/gateway';
import {
  createCheckout,
  handleWebhook,
  markShareAsPaid,
  paymentsOverview,
  reconcileOrder,
} from './payment-service';
import { approveRefund } from './refund-service';
import {
  cancelEntryAsOrganiser,
  enterTournament,
  expireStaleHolds,
  listMyRegistrations,
  respondToInvite,
  withdrawMyRegistration,
} from './registration-service';
import { actorFromWebToken, createWebSession } from './session-service';

let gateway: FakeGateway;
beforeEach(async () => {
  await resetDatabase();
  gateway = new FakeGateway();
  setGatewayForTests(gateway);
});
afterEach(() => setGatewayForTests(undefined));

const NOW = new Date('2026-12-01T12:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

async function player(overrides: Record<string, unknown> = {}, role?: Role) {
  const p = await createPlayer(overrides);
  await prisma.user.update({ where: { id: p.userId }, data: { emailVerifiedAt: new Date() } });
  if (role) await prisma.userRole.create({ data: { userId: p.userId, role } });
  const actor = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
  return { ...p, actor };
}

async function tournament(overrides: Record<string, unknown> = {}) {
  return prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-11-01T08:00:00Z'),
      registrationClosesAt: new Date('2027-02-27T22:59:00Z'),
      entryDeadline: new Date('2027-02-27T22:59:00Z'),
      withdrawalDeadline: new Date('2027-02-20T22:59:00Z'),
      status: 'OPEN',
      isPublished: true,
      maxEventsPerPlayer: 3,
      ...overrides,
    },
  });
}

const event = (tournamentId: string, discipline: 'DE' | 'DD' | 'GD' | 'HE', extra = {}) =>
  prisma.tournamentEvent.create({ data: { tournamentId, discipline, feeCents: 1500, ...extra } });

async function enter(actor: Awaited<ReturnType<typeof player>>['actor'], events: object[]) {
  return enterTournament(actor, 'utrecht-open', { events, acceptTerms: true }, meta, NOW);
}

/** What Stripe would post for an intent. */
function webhookBody(id: string, intentId: string) {
  const intent = gateway.intents.get(intentId)!;
  const event: GatewayEvent = { id, type: `payment_intent.${intent.status}`, intent, raw: {} };
  return JSON.stringify(event);
}

describe('paying an entry online', () => {
  it('holds the place, takes the payment via the webhook once, confirms and sends a receipt', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE');
    const anna = await player({ firstName: 'Anna' });
    const entered = await enter(anna.actor, [{ eventId: de.id }]);
    expect(entered.registrations[0]).toMatchObject({ status: 'PENDING' });
    expect(entered.holdExpiresAt).toEqual(minutes(30));
    expect(lastMailTo(anna.email).mail?.text).toContain('30 minuten');

    const checkout = await createCheckout(
      anna.actor,
      { participantIds: [entered.registrations[0]!.participantId] },
      NOW,
    );
    expect(checkout).toMatchObject({ amountCents: 1500, publishableKey: 'pk_test_fake' });
    expect(checkout.orderNumber).toMatch(/^2026-\d{6}$/);
    // Opening the payment window again reuses the order and intent.
    const again = await createCheckout(
      anna.actor,
      { participantIds: [entered.registrations[0]!.participantId] },
      NOW,
    );
    expect(again.orderId).toBe(checkout.orderId);
    expect(gateway.intents.size).toBe(1);

    const intentId = [...gateway.intents.keys()][0]!;
    gateway.pay(intentId);
    await expect(handleWebhook(webhookBody('evt_1', intentId), 'nope')).rejects.toMatchObject({
      code: 'validation',
    });
    expect(await handleWebhook(webhookBody('evt_1', intentId), 'valid')).toEqual({
      duplicate: false,
    });
    expect(await handleWebhook(webhookBody('evt_1', intentId), 'valid')).toEqual({
      duplicate: true,
    });

    const r = await prisma.registration.findFirstOrThrow({ include: { participants: true } });
    expect(r).toMatchObject({ status: 'CONFIRMED', holdExpiresAt: null });
    expect(r.participants[0]!.paymentStatus).toBe('PAID');
    const payment = await prisma.payment.findFirstOrThrow();
    expect(payment).toMatchObject({ status: 'SUCCEEDED', method: 'IDEAL' });
    expect(lastMailTo(anna.email).mail?.subject).toContain(checkout.orderNumber!);
    expect(await prisma.auditLog.count({ where: { action: 'payment.succeeded' } })).toBe(1);
  });

  it('reconciles on the result page before the webhook arrives', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE');
    const anna = await player();
    const entered = await enter(anna.actor, [{ eventId: de.id }]);
    const checkout = await createCheckout(
      anna.actor,
      { participantIds: [entered.registrations[0]!.participantId] },
      NOW,
    );
    gateway.pay([...gateway.intents.keys()][0]!, 'CARD');
    const bea = await player();
    await expect(reconcileOrder(checkout.orderId!, bea.actor)).rejects.toMatchObject({
      code: 'notFound',
    });
    expect(await reconcileOrder(checkout.orderId!, anna.actor)).toMatchObject({
      status: 'PAID',
      paymentStatus: 'SUCCEEDED',
    });
  });

  it('refuses shares that are not mine or already paid', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE');
    const anna = await player();
    const bea = await player();
    const entered = await enter(anna.actor, [{ eventId: de.id }]);
    await expect(
      createCheckout(bea.actor, { participantIds: [entered.registrations[0]!.participantId] }, NOW),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('confirms free events straight away with the share waived', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE', { feeCents: 0 });
    const anna = await player();
    const entered = await enter(anna.actor, [{ eventId: de.id }]);
    expect(entered.registrations[0]).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'WAIVED',
    });
    expect(entered.holdExpiresAt).toBeNull();
  });
});

describe('payment holds and the waiting list', () => {
  it('releases an unpaid place after 30 minutes and gives the next pair 48 hours to pay', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE', { maxEntries: 2 });
    const [a, b, c] = [await player(), await player(), await player()];
    await enter(a.actor, [{ eventId: de.id }]);
    await enter(b.actor, [{ eventId: de.id }]);
    const waiting = await enter(c.actor, [{ eventId: de.id }]);
    expect(waiting.registrations[0]).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });

    expect(await expireStaleHolds(minutes(29))).toBe(0);
    // b's payment is in progress (iDEAL can take a moment): b keeps the place.
    const bShare = (await listMyRegistrations(b.actor, NOW))[0]!;
    await createCheckout(b.actor, { participantIds: [bShare.participantId] }, NOW);
    await prisma.payment.updateMany({ data: { status: 'PROCESSING' } });

    expect(await expireStaleHolds(minutes(31))).toBe(1);
    const rows = await prisma.registration.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['CANCELLED', 'PENDING', 'PENDING']);
    expect(rows[2]!.holdExpiresAt).toEqual(new Date(minutes(31).getTime() + 48 * 3_600_000));
    expect(await prisma.order.count({ where: { status: 'EXPIRED' } })).toBe(0);
  });

  it('refunds a payment that arrives after the place was released', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE');
    const anna = await player();
    const entered = await enter(anna.actor, [{ eventId: de.id }]);
    const checkout = await createCheckout(
      anna.actor,
      { participantIds: [entered.registrations[0]!.participantId] },
      NOW,
    );
    await expireStaleHolds(minutes(45));
    const intentId = [...gateway.intents.keys()][0]!;
    gateway.pay(intentId);
    await handleWebhook(webhookBody('evt_late', intentId), 'valid');
    expect(gateway.refunds).toMatchObject([{ paymentIntentId: intentId, amountCents: 1500 }]);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: checkout.orderId! } }),
    ).toMatchObject({
      status: 'REFUNDED',
    });
  });
});

describe('multi-category discount (D52)', () => {
  it('charges the bundle price and spreads it over the categories', async () => {
    const t = await tournament({ bundlePricesCents: [1500, 2500, 3200] });
    const de = await event(t.id, 'DE');
    const dd = await event(t.id, 'DD', { feeCents: 1800 });
    const gd = await event(t.id, 'GD', { feeCents: 1800 });
    const anna = await player({ gender: 'FEMALE' });
    const entered = await enter(anna.actor, [
      { eventId: de.id },
      { eventId: dd.id, lookingForPartner: true },
    ]);
    const ids = entered.registrations.map((r) => r.participantId!);
    const mine = await listMyRegistrations(anna.actor, NOW);
    expect(mine.reduce((n, r) => n + (r.amountDueCents ?? 0), 0)).toBe(2500);
    const checkout = await createCheckout(anna.actor, { participantIds: ids }, NOW);
    expect(checkout.amountCents).toBe(2500);
    gateway.pay([...gateway.intents.keys()][0]!);
    await reconcileOrder(checkout.orderId!, anna.actor);

    // A third category later: only the difference to the 3-category price.
    const third = await enter(anna.actor, [{ eventId: gd.id, lookingForPartner: true }]);
    const extra = await createCheckout(
      anna.actor,
      { participantIds: [third.registrations[0]!.participantId!] },
      NOW,
    );
    expect(extra.amountCents).toBe(700);
  });

  it('works without online payment too: the desk sees the discounted amount', async () => {
    setGatewayForTests(null);
    const t = await tournament({ bundlePricesCents: [1500, 2000] });
    const de = await event(t.id, 'DE');
    const dd = await event(t.id, 'DD');
    const anna = await player({ gender: 'FEMALE' });
    await enter(anna.actor, [{ eventId: de.id }, { eventId: dd.id, lookingForPartner: true }]);
    const admin = await player({}, Role.ADMIN);
    const overview = await paymentsOverview(admin.actor, { tournamentId: t.id });
    expect(overview.totals).toMatchObject({ outstandingCents: 2000, outstandingShares: 2 });
  });
});

describe('doubles where the entrant pays for both', () => {
  it('charges twice the fee and covers the partner', async () => {
    const t = await tournament({ partnerPaymentMode: 'INITIATOR_PAYS_ALL' });
    const gd = await event(t.id, 'GD');
    const anna = await player({ gender: 'FEMALE' });
    const bram = await player({ gender: 'MALE' });
    const entered = await enter(anna.actor, [{ eventId: gd.id, partner: bram.email }]);
    const checkout = await createCheckout(
      anna.actor,
      { participantIds: [entered.registrations[0]!.participantId!] },
      NOW,
    );
    expect(checkout.amountCents).toBe(3000);
    const token = lastMailTo(bram.email).link!.split('/invites/')[1]!;
    await respondToInvite(bram.actor, { token }, true, meta, NOW);
    const bramShare = await prisma.registrationParticipant.findFirstOrThrow({
      where: { role: 'PARTNER' },
    });
    expect(bramShare.paymentStatus).toBe('PAID_BY_PARTNER');
  });
});

describe('refunds and desk payments', () => {
  async function paidEntry(overrides: Record<string, unknown>) {
    const t = await tournament(overrides);
    const de = await event(t.id, 'DE');
    const anna = await player();
    const entered = await enter(anna.actor, [{ eventId: de.id }]);
    const checkout = await createCheckout(
      anna.actor,
      { participantIds: [entered.registrations[0]!.participantId!] },
      NOW,
    );
    gateway.pay([...gateway.intents.keys()][0]!);
    await reconcileOrder(checkout.orderId!, anna.actor);
    return { t, anna, registrationId: entered.registrations[0]!.id, orderId: checkout.orderId! };
  }

  it('refunds automatically by the tournament percentage when a player withdraws', async () => {
    const { anna, registrationId, orderId } = await paidEntry({
      refundPolicy: 'AUTOMATIC_BEFORE_DEADLINE',
      refundPercent: 90,
    });
    await withdrawMyRegistration(anna.actor, registrationId, {}, meta, NOW);
    expect(gateway.refunds).toMatchObject([{ amountCents: 1350 }]);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: 'PARTIALLY_REFUNDED',
    });
    expect(lastMailTo(anna.email).mail?.subject).toContain('Terugbetaling');
  });

  it('waits for an admin under ADMIN_APPROVAL, then pays back', async () => {
    const { anna, registrationId } = await paidEntry({ refundPolicy: 'ADMIN_APPROVAL' });
    await withdrawMyRegistration(anna.actor, registrationId, {}, meta, NOW);
    expect(gateway.refunds).toHaveLength(0);
    const admin = await player({}, Role.ADMIN);
    const overview = await paymentsOverview(admin.actor);
    expect(overview.refundRequests).toHaveLength(1);
    await expect(
      approveRefund(anna.actor, overview.refundRequests[0]!.id, meta),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await approveRefund(admin.actor, overview.refundRequests[0]!.id, meta)).toBe(
      'SUCCEEDED',
    );
    expect(gateway.refunds).toMatchObject([{ amountCents: 1500 }]);
  });

  it('pays back in full when the organisers cancel, whatever the policy', async () => {
    const { registrationId } = await paidEntry({ refundPolicy: 'NO_REFUNDS' });
    const admin = await player({}, Role.ADMIN);
    await cancelEntryAsOrganiser(
      admin.actor,
      registrationId,
      { reason: 'Event cancelled' },
      meta,
      NOW,
    );
    expect(gateway.refunds).toMatchObject([{ amountCents: 1500 }]);
  });

  it('lets an organiser record a desk payment, audited', async () => {
    setGatewayForTests(null);
    const t = await tournament();
    const de = await event(t.id, 'DE');
    const anna = await player();
    await enter(anna.actor, [{ eventId: de.id }]);
    const share = await prisma.registrationParticipant.findFirstOrThrow();
    await expect(
      markShareAsPaid(anna.actor, { participantId: share.id }, meta),
    ).rejects.toMatchObject({
      code: 'notFound',
    });
    const admin = await player({}, Role.ADMIN);
    await markShareAsPaid(admin.actor, { participantId: share.id }, meta);
    expect(
      (await prisma.registrationParticipant.findUniqueOrThrow({ where: { id: share.id } }))
        .paymentStatus,
    ).toBe('PAID');
    expect(await prisma.payment.findFirstOrThrow()).toMatchObject({
      method: 'MANUAL',
      amountCents: 1500,
    });
    await expect(
      markShareAsPaid(admin.actor, { participantId: share.id }, meta),
    ).rejects.toMatchObject({
      code: 'statusTransition',
    });
  });
});
