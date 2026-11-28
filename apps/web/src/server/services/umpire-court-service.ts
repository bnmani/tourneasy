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
