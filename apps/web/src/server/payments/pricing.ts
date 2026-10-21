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
