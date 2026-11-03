/**
 * Payment policy and amounts (D51, D52). Kept apart from the services so the registration and
 * payment services can both use it without importing each other.
 */
import { prisma, type Discipline, type Prisma } from '@tourneasy/db';
import { bundleTotal, isDoubles, splitBundle } from '@tourneasy/shared';
import { getGateway } from './gateway';

/** Minutes a new, unpaid entry keeps its place. */
export const HOLD_MINUTES = 30;
/** Hours a pair promoted from the waiting list has to pay. */
export const PROMOTION_HOURS = 48;

export const paymentsEnabled = async () => (await getGateway()) !== null;

type Db = Prisma.TransactionClient | typeof prisma;
type FeeEvent = { discipline: Discipline; feeCents: number };

/** The partner's fee that the entrant pays on top of their own (INITIATOR_PAYS_ALL doubles). */
function partnerPart(role: string, event: FeeEvent, mode: string) {
  return role === 'PRIMARY' && mode === 'INITIATOR_PAYS_ALL' && isDoubles(event.discipline)
    ? event.feeCents
    : 0;
}

/**
 * What a player still owes per unpaid share in one tournament (participantId → cents).
 * With a multi-category price list the player's own categories are priced together: the bundle
 * total for all their entered categories, minus what they already paid, spread over the unpaid
 * ones. Shares paid by a partner or free events don't count.
 */
export async function amountsDue(playerId: string, tournamentId: string, db: Db = prisma) {
  const tournament = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { bundlePricesCents: true, partnerPaymentMode: true },
  });
  const shares = await db.registrationParticipant.findMany({
    where: {
      playerId,
      active: true,
      paymentStatus: { in: ['UNPAID', 'PAID'] },
      registration: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        event: { tournamentId, feeCents: { gt: 0 } },
      },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      paymentStatus: true,
      registration: { select: { event: { select: { discipline: true, feeCents: true } } } },
      orderItems: {
        where: { order: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
        select: { amountCents: true, refundedCents: true },
      },
    },
  });
  const mode = tournament.partnerPaymentMode;
  const extra = (s: (typeof shares)[number]) => partnerPart(s.role, s.registration.event, mode);
  const unpaid = shares.filter((s) => s.paymentStatus === 'UNPAID');
  const due = new Map<string, number>();
  const total = bundleTotal(tournament.bundlePricesCents, shares.length);
  if (total === null) {
    for (const s of unpaid) due.set(s.id, s.registration.event.feeCents + extra(s));
    return due;
  }
  const alreadyPaid = shares
    .filter((s) => s.paymentStatus === 'PAID')
    .reduce(
      (n, s) =>
        n + s.orderItems.reduce((m, i) => m + i.amountCents - i.refundedCents, 0) - extra(s),
      0,
    );
  const split = splitBundle(
    total,
    alreadyPaid,
    unpaid.map((s) => s.registration.event.feeCents),
  );
  unpaid.forEach((s, i) => due.set(s.id, split[i]! + extra(s)));
  return due;
}

/**
 * What goes back when a paid share is withdrawn (D109). With a multi-category price list the
 * player keeps paying the list price for the paid categories they keep: refund = what they
 * paid (this share, the kept ones, and anything kept back at an earlier withdrawal) minus that
 * price. It comes first from this share, then from the earlier withdrawn shares' remainder.
 * Without a price list it is this share's own open amount, as before.
 */
export async function refundPlan(participantId: string, open: number, db: Db = prisma) {
  const share = await db.registrationParticipant.findUniqueOrThrow({
    where: { id: participantId },
    select: {
      playerId: true,
      role: true,
      registrationId: true,
      registration: {
        select: {
          event: {
            select: {
              discipline: true,
              feeCents: true,
              tournament: {
                select: { id: true, bundlePricesCents: true, partnerPaymentMode: true },
              },
            },
          },
        },
      },
    },
  });
  const { tournament, ...event } = share.registration.event;
  if (tournament.bundlePricesCents.length === 0)
    return {
      selfCents: open,
      earlier: [] as { orderItemId: string; paymentId: string; cents: number }[],
      kept: null,
    };
  const mode = tournament.partnerPaymentMode;
  const paidItems = {
    where: { order: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
    select: {
      id: true,
      amountCents: true,
      refundedCents: true,
      refunds: {
        where: { status: { in: ['REQUESTED', 'APPROVED', 'PENDING'] } },
        select: { amountCents: true },
      },
      order: {
        select: {
          payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
        },
      },
    },
  } satisfies Prisma.RegistrationParticipant$orderItemsArgs;
  const mine = { playerId: share.playerId, registrationId: { not: share.registrationId } };
  const inTournament = { event: { tournamentId: tournament.id, feeCents: { gt: 0 } } };
  const [kept, withdrawn] = await Promise.all([
    db.registrationParticipant.findMany({
      where: {
        ...mine,
        active: true,
        paymentStatus: 'PAID',
        registration: { status: { in: ['PENDING', 'CONFIRMED'] }, ...inTournament },
      },
      select: {
        role: true,
        registration: { select: { event: { select: { discipline: true, feeCents: true } } } },
        orderItems: paidItems,
      },
    }),
    db.registrationParticipant.findMany({
      where: {
        ...mine,
        registration: {
          status: { notIn: ['PENDING', 'CONFIRMED', 'WAITLISTED'] },
          ...inTournament,
        },
      },
      select: { orderItems: paidItems },
    }),
  ]);
  const openOf = (i: {
    amountCents: number;
    refundedCents: number;
    refunds: { amountCents: number }[];
  }) => i.amountCents - i.refundedCents - i.refunds.reduce((n, r) => n + r.amountCents, 0);
  const keptPaid = kept.reduce(
    (n, s) =>
      n +
      s.orderItems.reduce((m, i) => m + openOf(i), 0) -
      partnerPart(s.role, s.registration.event, mode),
    0,
  );
  const earlierOpen = withdrawn
    .flatMap((s) => s.orderItems)
    .filter((i) => openOf(i) > 0 && i.order.payments[0])
    .map((i) => ({ orderItemId: i.id, paymentId: i.order.payments[0]!.id, cents: openOf(i) }));
  const priceKept = bundleTotal(tournament.bundlePricesCents, kept.length) ?? 0;
  // A partner's fee paid on top always goes back in full.
  const extra = Math.min(open, partnerPart(share.role, event, mode));
  const own = open - extra;
  let left = Math.max(0, keptPaid + own + earlierOpen.reduce((n, e) => n + e.cents, 0) - priceKept);
  const selfOwn = Math.min(own, left);
  left -= selfOwn;
  const earlier = [];
  for (const e of earlierOpen) {
    if (left <= 0) break;
    const cents = Math.min(e.cents, left);
    earlier.push({ ...e, cents });
    left -= cents;
  }
  return {
    selfCents: extra + selfOwn,
    earlier,
    kept: { count: kept.length, priceCents: priceKept, paidCents: keptPaid },
  };
}
