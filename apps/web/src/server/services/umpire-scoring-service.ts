/**
 * Umpire scoring: the stored `UmpireEvent` log is the score. Every call replays the FULL log
 * for the match, in `seq` order, through `applyEvents` from `[]` (an undo can only reach points
 * inside the events it is given, so passing only the new batch would break undo across
 * batches). The first server comes from the umpire's serve choice, stored on the match.
 *
 * Deduplication happens only here: an event whose id is already stored is a duplicate and is not
 * applied. An accepted event is inserted once and never updated or deleted. A rejected event is
 * reported to the caller and nothing is written for it. Each call runs in one transaction and
 * compare-and-sets the match `version`, so two writers cannot interleave.
 */
import {
  applyEvents,
  checkMatchScore,
  rulesForMatch,
  type Game,
  type RejectReason,
  type ScoreEvent,
} from '@tourneasy/shared';
import { Prisma, prisma } from '@tourneasy/db';
import { AppError } from '../lib/errors';
import { activeUmpire } from './umpire-court-service';

type Tx = Prisma.TransactionClient;

/** An event as sent by the phone: the shared event plus its position in the match. */
export type SeqEvent = ScoreEvent & { seq: number };

export type PostEventsResult = {
  applied: number;
  duplicates: number;
  serving: 'A' | 'B';
  games: Game[];
  /** The match version after this call. */
  version: number;
  /** Set when the rules refused an event; it and the events after it were not written. */
  rejected?: RejectReason;
};

const FINAL = ['AWAITING_DESK', 'COMPLETED', 'WALKOVER', 'RETIRED'];

/** Loads the match for an umpire who holds its court; anyone else is refused. */
async function loadForUmpire(tx: Tx, umpireId: string, matchId: string) {
  const umpire = await activeUmpire(umpireId, tx);
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      version: true,
      round: true,
      bracket: true,
      umpireStartServer: true,
      slot: { select: { courtId: true } },
      draw: {
        select: {
          stage: true,
          type: true,
          size: true,
          event: {
            select: {
              tournamentId: true,
              bestOf: true,
              pointsToWin: true,
              pointsCap: true,
              koScoringFrom: true,
              koBestOf: true,
              koPointsToWin: true,
              koPointsCap: true,
            },
          },
        },
      },
    },
  });
  if (!match || match.draw.event.tournamentId !== umpire.tournamentId) {
    throw new AppError('notFound');
  }
  const courtId = match.slot?.courtId;
  if (!courtId) throw new AppError('matchNotScheduled');
  const hold = await tx.courtHold.findUnique({ where: { courtId } });
  if (!hold) throw new AppError('forbidden');
  if (hold.umpireId !== umpireId) throw new AppError('courtHeld');
  const rules = rulesForMatch(match.draw.event, {
    ...match.draw,
    round: match.round,
    bracket: match.bracket,
  });
  return { match, courtId, rules };
}

/** Moves the match version on by one, but only if nobody changed it since it was read. */
async function bumpVersion(
  tx: Tx,
  matchId: string,
  version: number,
  data: Prisma.MatchUpdateManyMutationInput = {},
): Promise<number> {
  const { count } = await tx.match.updateMany({
    where: { id: matchId, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 0) throw new AppError('resultConflict');
  return version + 1;
}

/** Runs a transaction and turns the database's unique-seq refusal into a conflict. */
async function transaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(run);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('resultConflict');
    }
    throw error;
  }
}

async function storedLog(tx: Tx, matchId: string) {
  const rows = await tx.umpireEvent.findMany({
    where: { matchId },
    orderBy: { seq: 'asc' },
    select: { id: true, seq: true, kind: true, side: true },
  });
  const log: ScoreEvent[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    ...(r.side ? { side: r.side } : {}),
  }));
  return { log, lastSeq: rows[rows.length - 1]?.seq ?? 0 };
}

/** The umpire starts the match and chooses who serves first. */
export async function startMatch(
  umpireId: string,
  matchId: string,
  serving: 'A' | 'B',
): Promise<void> {
  if (serving !== 'A' && serving !== 'B') throw new AppError('validation');
  await transaction(async (tx) => {
    const { match } = await loadForUmpire(tx, umpireId, matchId);
    const started = match.status === 'IN_PROGRESS';
    if (!started && match.status !== 'SCHEDULED' && match.status !== 'CALLED') {
      throw new AppError('statusTransition');
    }
    // The serve choice can be corrected until the first point; after that the replay depends on it.
    if (started && (await tx.umpireEvent.count({ where: { matchId } })) > 0) {
      throw new AppError('statusTransition');
    }
    await bumpVersion(tx, matchId, match.version, {
      status: 'IN_PROGRESS',
      umpireStartServer: serving,
      ...(started ? {} : { startedAt: new Date() }),
    });
  });
}

/**
 * Applies events in `seq` order. Returns what was applied, how many were duplicates, and the
 * score after them; a rule refusal comes back as `rejected` instead of an error.
 */
export async function postEvents(
  umpireId: string,
  matchId: string,
  events: SeqEvent[],
): Promise<PostEventsResult> {
  return transaction(async (tx) => {
    const { match, courtId, rules } = await loadForUmpire(tx, umpireId, matchId);
    const { log, lastSeq } = await storedLog(tx, matchId);
    const initialServing = match.umpireStartServer ?? 'A';

    // Duplicates: ids already stored, or repeated inside this batch.
    const known = new Set(
      (
        await tx.umpireEvent.findMany({
          where: { id: { in: events.map((e) => e.id) } },
          select: { id: true },
        })
      ).map((e) => e.id),
    );
    const fresh: SeqEvent[] = [];
    let duplicates = 0;
    for (const event of events) {
      if (known.has(event.id)) {
        duplicates += 1;
      } else {
        known.add(event.id);
        fresh.push(event);
      }
    }
    fresh.sort((a, b) => a.seq - b.seq);

    const state = (applied: number, rejected?: RejectReason): PostEventsResult => {
      const result = applyEvents([], log, rules, initialServing);
      return {
        applied,
        duplicates,
        serving: result.serving,
        games: result.games,
        version: match.version,
        ...(rejected ? { rejected } : {}),
      };
    };

    if (fresh.length === 0) return state(0);
    if (FINAL.includes(match.status)) return state(0, 'matchFinished');
    if (match.status !== 'IN_PROGRESS') throw new AppError('statusTransition');

    // Seq must move forward past the stored log, or the replay order would change.
    let previous = lastSeq;
    for (const event of fresh) {
      if (!Number.isInteger(event.seq) || event.seq <= previous)
        throw new AppError('resultConflict');
      previous = event.seq;
    }

    const accepted: SeqEvent[] = [];
    let rejected: RejectReason | undefined;
    for (const event of fresh) {
      const scoreEvent: ScoreEvent = {
        id: event.id,
        kind: event.kind,
        ...(event.side ? { side: event.side } : {}),
      };
      const result = applyEvents([], [...log, scoreEvent], rules, initialServing);
      if (result.rejected) {
        rejected = result.rejected;
        break;
      }
      log.push(scoreEvent);
      accepted.push(event);
    }

    let version = match.version;
    if (accepted.length > 0) {
      version = await bumpVersion(tx, matchId, match.version);
      await tx.umpireEvent.createMany({
        data: accepted.map((e) => ({
          id: e.id,
          matchId,
          courtId,
          umpireId,
          seq: e.seq,
          kind: e.kind,
          side: e.kind === 'POINT' ? e.side : null,
        })),
      });
    }
    return { ...state(accepted.length, rejected), version };
  });
}

/** The umpire sends a decided match to the desk. Sending it again changes nothing. */
export async function finishMatch(
  umpireId: string,
  matchId: string,
): Promise<{ status: 'AWAITING_DESK'; games: Game[] }> {
  return transaction(async (tx) => {
    const { match, rules } = await loadForUmpire(tx, umpireId, matchId);
    if (match.status !== 'IN_PROGRESS' && match.status !== 'AWAITING_DESK') {
      throw new AppError('statusTransition');
    }
    const { log } = await storedLog(tx, matchId);
    const { games } = applyEvents([], log, rules, match.umpireStartServer ?? 'A');
    if (match.status === 'AWAITING_DESK') return { status: 'AWAITING_DESK', games };
    if (!checkMatchScore(games, rules).ok) throw new AppError('matchNotDecided');
    await bumpVersion(tx, matchId, match.version, { status: 'AWAITING_DESK' });
    return { status: 'AWAITING_DESK', games };
  });
}
