/**
 * Court holds: one umpire at a time scores a court. A hold is one `CourtHold` row keyed by the
 * court, so claiming is a single atomic insert and two umpires can never both get it.
 */
import { Prisma, prisma } from '@tourneasy/db';
import { AppError } from '../lib/errors';

/** The umpire if their profile still works (not revoked, not expired); otherwise unauthorized. */
export async function activeUmpire(umpireId: string, db: Prisma.TransactionClient = prisma) {
  const umpire = await db.umpire.findUnique({ where: { id: umpireId } });
  if (!umpire || umpire.revokedAt !== null || umpire.expiresAt <= new Date()) {
    throw new AppError('unauthorized');
  }
  return umpire;
}

/** Takes the court. Claiming a court you already hold is fine; another umpire's court is 409. */
export async function claimCourt(umpireId: string, courtId: string): Promise<void> {
  const umpire = await activeUmpire(umpireId);
  // The court must belong to the venue of the umpire's tournament.
  const court = await prisma.court.findFirst({
    where: { id: courtId, venue: { tournaments: { some: { id: umpire.tournamentId } } } },
    select: { id: true },
  });
  if (!court) throw new AppError('notFound');
  try {
    await prisma.courtHold.create({ data: { courtId, umpireId } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    const hold = await prisma.courtHold.findUnique({ where: { courtId } });
    // No hold now means it was released between the insert and the read: the claim lost the race.
    if (hold?.umpireId !== umpireId) throw new AppError('courtHeld');
  }
}

/** Gives the court up. Only the holder can; releasing a free court does nothing. */
export async function releaseCourt(umpireId: string, courtId: string): Promise<void> {
  await activeUmpire(umpireId);
  const { count } = await prisma.courtHold.deleteMany({ where: { courtId, umpireId } });
  if (count > 0) return;
  if (await prisma.courtHold.findUnique({ where: { courtId } })) throw new AppError('forbidden');
}

export type CourtListItem = {
  id: string;
  number: number;
  name: string | null;
  status: 'FREE' | 'HELD' | 'HELD_BY_ME';
  holderName: string | null;
  /** Only the court's current match (called or being played), with no player data. */
  match: { id: string; status: string; round: number; matchNumber: number } | null;
};

const CURRENT = ['CALLED', 'IN_PROGRESS', 'AWAITING_DESK'] as const;

export async function listCourts(tournamentId: string, umpireId: string): Promise<CourtListItem[]> {
  const umpire = await activeUmpire(umpireId);
  if (umpire.tournamentId !== tournamentId) throw new AppError('notFound');
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { venueId: true },
  });
  if (!tournament?.venueId) return [];
  const courts = await prisma.court.findMany({
    where: { venueId: tournament.venueId },
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      name: true,
      hold: { select: { umpireId: true, umpire: { select: { displayName: true } } } },
      slots: {
        where: { tournamentId, match: { status: { in: [...CURRENT] } } },
        orderBy: { startsAt: 'asc' },
        take: 1,
        select: { match: { select: { id: true, status: true, round: true, matchNumber: true } } },
      },
    },
  });
  return courts.map((c) => ({
    id: c.id,
    number: c.number,
    name: c.name,
    status: !c.hold ? 'FREE' : c.hold.umpireId === umpireId ? 'HELD_BY_ME' : 'HELD',
    holderName: c.hold?.umpire.displayName ?? null,
    match: c.slots[0]?.match ?? null,
  }));
}

/** How long the holder has to answer a take-over request, from the server clock at request time. */
export const TAKEOVER_WINDOW_SECONDS = 120;

/**
 * A reserve umpire asks the holder to hand the court over. Refused when the court has no holder
 * (claim it instead), when the requester already holds it, or while another request for the court
 * is still open. The hold row is locked so two requests at the same moment cannot both pass.
 */
export async function requestTakeover(reserveUmpireId: string, courtId: string) {
  const reserve = await activeUmpire(reserveUmpireId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "CourtHold" WHERE "courtId" = ${courtId}::uuid FOR UPDATE`;
    const hold = await tx.courtHold.findUnique({
      where: { courtId },
      select: { umpireId: true, umpire: { select: { tournamentId: true } } },
    });
    if (!hold || hold.umpire.tournamentId !== reserve.tournamentId)
      throw new AppError('courtNotHeld');
    if (hold.umpireId === reserveUmpireId) throw new AppError('alreadyHolder');
    const now = new Date();
    const open = await tx.takeoverRequest.findFirst({
      where: { courtId, status: 'PENDING', expiresAt: { gt: now } },
      select: { id: true },
    });
    if (open) throw new AppError('takeoverPending');
    return tx.takeoverRequest.create({
      data: {
        courtId,
        fromUmpireId: reserveUmpireId,
        toUmpireId: hold.umpireId,
        expiresAt: new Date(now.getTime() + TAKEOVER_WINDOW_SECONDS * 1000),
      },
    });
  });
}

/**
 * The holder accepts or declines. One guarded write (still PENDING, not expired, sent to this
 * umpire) decides it; whoever loses a race, or answers late, gets `takeoverClosed`. Accepting also
 * moves the hold in the same transaction. The match and its score are not touched.
 */
export async function answerTakeover(
  currentUmpireId: string,
  requestId: string,
  answer: 'ACCEPT' | 'DECLINE',
): Promise<void> {
  await activeUmpire(currentUmpireId);
  const request = await prisma.takeoverRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AppError('notFound');
  if (request.toUmpireId !== currentUmpireId) throw new AppError('forbidden');
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const { count } = await tx.takeoverRequest.updateMany({
      where: {
        id: requestId,
        toUmpireId: currentUmpireId,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      data: { status: answer === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED' },
    });
    if (count === 0) throw new AppError('takeoverClosed');
    if (answer === 'DECLINE') return;
    // The reserve's profile must still work, and the hold must still be the answerer's.
    await activeUmpire(request.fromUmpireId, tx).catch(() => {
      throw new AppError('takeoverClosed');
    });
    const moved = await tx.courtHold.updateMany({
      where: { courtId: request.courtId, umpireId: currentUmpireId },
      data: { umpireId: request.fromUmpireId, since: now },
    });
    if (moved.count === 0) throw new AppError('takeoverClosed');
  });
}

/** The reserve withdraws an open request. It is deleted (no desk alert); late cancels are refused. */
export async function cancelTakeover(reserveUmpireId: string, requestId: string): Promise<void> {
  await activeUmpire(reserveUmpireId);
  const request = await prisma.takeoverRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AppError('notFound');
  if (request.fromUmpireId !== reserveUmpireId) throw new AppError('forbidden');
  const { count } = await prisma.takeoverRequest.deleteMany({
    where: {
      id: requestId,
      fromUmpireId: reserveUmpireId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
  });
  if (count === 0) throw new AppError('takeoverClosed');
}
