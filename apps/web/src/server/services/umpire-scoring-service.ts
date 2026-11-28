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
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { assertCanManageTournament } from './permissions';
import { recordResult } from './results-service';
import type { Actor } from './session-service';
import { activeUmpire, assertNoOtherHold } from './umpire-court-service';

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
  /** The highest stored seq for the match, or 0. A phone starts its counter above this. */
  lastSeq: number;
  /** Set when the rules refused an event; it and the events after it were not written. */
  rejected?: RejectReason;
};

const FINAL = ['AWAITING_DESK', 'COMPLETED', 'WALKOVER', 'RETIRED'];

/**
 * Loads the match for an umpire who holds its court; anyone else is refused. The court's hold
 * row is read with SELECT ... FOR UPDATE inside the caller's transaction, so a release, claim or
 * take-over of the court waits until this scoring call has finished (exported for its test).
 */
export async function loadForUmpire(tx: Tx, umpireId: string, matchId: string) {
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
  const [hold] = await tx.$queryRaw<{ umpireId: string }[]>`
    SELECT "umpireId"::text AS "umpireId" FROM "CourtHold" WHERE "courtId" = ${courtId}::uuid FOR UPDATE`;
  if (!hold) throw new AppError('forbidden');
  if (hold.umpireId !== umpireId) throw new AppError('courtHeld');
  const rules = rulesForMatch(match.draw.event, {
    ...match.draw,
    round: match.round,
    bracket: match.bracket,
  });
  return { match, courtId, rules };
}

/**
 * The umpire says the match is being scored on paper. Only the court's holder can. One audit
 * entry records who and when; nothing else changes and no desk alert is made.
 */
export async function notifyPaper(
  umpireId: string,
  matchId: string,
  meta: RequestMeta = {},
): Promise<void> {
  await transaction(async (tx) => {
    const { match } = await loadForUmpire(tx, umpireId, matchId);
    if (match.status !== 'IN_PROGRESS' && match.status !== 'AWAITING_DESK') {
      throw new AppError('statusTransition');
    }
    await writeAudit(tx, {
      actorId: null,
      action: 'umpire.paper',
      entityType: 'Match',
      entityId: matchId,
      after: { umpireId, matchId, at: new Date().toISOString() },
      meta,
    });
  });
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

/**
 * The umpire chooses who serves first, once the desk has put the match on court. The desk's
 * "On court" sets IN_PROGRESS directly (nothing in the app sets CALLED), so only an IN_PROGRESS
 * match is accepted; SCHEDULED, CALLED and anything later are 409 `statusTransition`. The umpire
 * never moves a match on court by themselves: the desk's clash checks (player or court busy)
 * stay the only way in.
 */
export async function startMatch(
  umpireId: string,
  matchId: string,
  serving: 'A' | 'B',
): Promise<void> {
  if (serving !== 'A' && serving !== 'B') throw new AppError('validation');
  await transaction(async (tx) => {
    const { match } = await loadForUmpire(tx, umpireId, matchId);
    if (match.status !== 'IN_PROGRESS') throw new AppError('statusTransition');
    // The serve choice can be corrected until the first point; after that the replay depends on it.
    if ((await tx.umpireEvent.count({ where: { matchId } })) > 0) {
      throw new AppError('statusTransition');
    }
    await bumpVersion(tx, matchId, match.version, { umpireStartServer: serving });
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

    // Duplicates: ids already stored for THIS match, or repeated inside this batch. An id stored
    // on another match is a client bug (or a reused id), not a re-send: refuse the batch.
    const stored = await tx.umpireEvent.findMany({
      where: { id: { in: events.map((e) => e.id) } },
      select: { id: true, matchId: true },
    });
    if (stored.some((e) => e.matchId !== matchId)) throw new AppError('eventIdInUse');
    const known = new Set(stored.map((e) => e.id));
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

    let highestSeq = lastSeq;
    const state = (applied: number, rejected?: RejectReason): PostEventsResult => {
      const result = applyEvents([], log, rules, initialServing);
      return {
        applied,
        duplicates,
        serving: result.serving,
        games: result.games,
        version: match.version,
        lastSeq: highestSeq,
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
      highestSeq = event.seq;
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

export type MatchState = {
  status: string;
  version: number;
  games: Game[];
  serving: 'A' | 'B';
  lastSeq: number;
  /** The serve choice stored for the match, or null while none was made. */
  umpireStartServer: 'A' | 'B' | null;
};

/** The score as the server has it, for the umpire who holds the court. */
export async function getMatchState(umpireId: string, matchId: string): Promise<MatchState> {
  return transaction(async (tx) => {
    const { match, rules } = await loadForUmpire(tx, umpireId, matchId);
    const { log, lastSeq } = await storedLog(tx, matchId);
    const result = applyEvents([], log, rules, match.umpireStartServer ?? 'A');
    return {
      status: match.status,
      version: match.version,
      games: result.games,
      serving: result.serving,
      lastSeq,
      umpireStartServer: match.umpireStartServer,
    };
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

// ---------------------------------------------------------------------------------------------
// The match desk. The umpire's log is never changed here: a desk correction is an audit entry
// (old score, new score, reason, actor, time) and the desk score is the latest correction, or
// the replay of the log when nobody corrected it. Confirming hands that score to `recordResult`,
// the same path a typed-in result takes (draws, standings, results email).
// ---------------------------------------------------------------------------------------------

const CORRECT_ACTION = 'match.umpireCorrect';
const RESOLVE_ACTION = 'deskAlert.resolve';

const gamesSchema = z
  .array(z.tuple([z.coerce.number().int().min(0).max(99), z.coerce.number().int().min(0).max(99)]))
  .max(5);

/** The match with what the rules need, for the desk. */
async function loadDeskMatch(db: Tx | typeof prisma, matchId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      version: true,
      round: true,
      bracket: true,
      umpireStartServer: true,
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
  if (!match) throw new AppError('notFound');
  const rules = rulesForMatch(match.draw.event, {
    ...match.draw,
    round: match.round,
    bracket: match.bracket,
  });
  return { match, rules };
}
type DeskMatch = Awaited<ReturnType<typeof loadDeskMatch>>;

/** What the umpire's log adds up to. */
async function umpireGames(tx: Tx | typeof prisma, { match, rules }: DeskMatch): Promise<Game[]> {
  const rows = await tx.umpireEvent.findMany({
    where: { matchId: match.id },
    orderBy: { seq: 'asc' },
    select: { id: true, kind: true, side: true },
  });
  const log: ScoreEvent[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    ...(r.side ? { side: r.side } : {}),
  }));
  return applyEvents([], log, rules, match.umpireStartServer ?? 'A').games;
}

/** The score the desk is looking at: the latest correction, else the umpire's. */
async function deskGames(tx: Tx | typeof prisma, desk: DeskMatch): Promise<Game[]> {
  const rows = await tx.auditLog.findMany({
    where: { action: CORRECT_ACTION, entityType: 'Match', entityId: desk.match.id },
    select: { id: true, createdAt: true, after: true },
  });
  // Highest stored match version wins; rows without one (older) fall back to time, then id.
  const versionOf = (r: (typeof rows)[number]) =>
    (r.after as { version?: number } | null)?.version ?? -1;
  rows.sort(
    (a, b) =>
      versionOf(b) - versionOf(a) ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  const after = rows[0]?.after as { games?: Game[] } | null | undefined;
  return after?.games ?? (await umpireGames(tx, desk));
}

/** The desk fixes the score before confirming it. A reason is required; the umpire log stays. */
export async function correctMatchScore(
  actor: Actor,
  matchId: string,
  games: unknown,
  reason: string,
  meta: RequestMeta,
  version: number,
): Promise<void> {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (!why) throw validationError({ reason: 'required' });
  const next = parseInput(gamesSchema, games) as Game[];
  await transaction(async (tx) => {
    const desk = await loadDeskMatch(tx, matchId);
    await assertCanManageTournament(actor, desk.match.draw.event.tournamentId);
    if (desk.match.status !== 'AWAITING_DESK') throw new AppError('statusTransition');
    // The desk must have seen the current state: refuse before any write.
    if (version !== desk.match.version) throw new AppError('resultConflict');
    const check = checkMatchScore(next, desk.rules);
    if (!check.ok) {
      throw validationError({
        games: check.error,
        ...(check.game ? { game: String(check.game) } : {}),
      });
    }
    const before = await deskGames(tx, desk);
    const stored = await bumpVersion(tx, matchId, desk.match.version);
    await writeAudit(tx, {
      actorId: actor.userId,
      action: CORRECT_ACTION,
      entityType: 'Match',
      entityId: matchId,
      before: { games: before },
      after: { games: next, reason: why, version: stored },
      meta,
    });
  });
}

/** The desk accepts the score. It goes through the normal result path, then the match is final. */
export async function confirmMatchResult(
  actor: Actor,
  matchId: string,
  meta: RequestMeta,
  version: number,
): Promise<void> {
  const desk = await loadDeskMatch(prisma, matchId);
  await assertCanManageTournament(actor, desk.match.draw.event.tournamentId);
  if (desk.match.status !== 'AWAITING_DESK') throw new AppError('statusTransition');
  // Only the version the desk was shown can be confirmed (recordResult checks it again).
  if (version !== desk.match.version) throw new AppError('resultConflict');
  const games = await deskGames(prisma, desk);
  await recordResult(actor, matchId, { games, version }, meta);
}

export type DeskChangeLogEntry = {
  at: Date;
  by: string;
  kind: 'sent' | 'correct' | 'confirmed';
  before?: Game[];
  after?: Game[];
  reason?: string;
};

/** What the desk sees for a match waiting on it: the umpire's entry, the desk score and the log. */
export async function umpireDeskReview(actor: Actor, matchId: string) {
  const desk = await loadDeskMatch(prisma, matchId);
  await assertCanManageTournament(actor, desk.match.draw.event.tournamentId);
  const [games, current, last, audit] = await Promise.all([
    umpireGames(prisma, desk),
    deskGames(prisma, desk),
    prisma.umpireEvent.findFirst({
      where: { matchId },
      orderBy: { seq: 'desc' },
      select: { createdAt: true, umpire: { select: { displayName: true } } },
    }),
    prisma.auditLog.findMany({
      where: {
        entityType: 'Match',
        entityId: matchId,
        action: { in: [CORRECT_ACTION, 'match.result'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        action: true,
        createdAt: true,
        before: true,
        after: true,
        actor: { select: { name: true } },
      },
    }),
  ]);
  const changeLog: DeskChangeLogEntry[] = [];
  if (last) {
    changeLog.push({ at: last.createdAt, by: last.umpire.displayName, kind: 'sent' });
  }
  for (const row of audit) {
    const before = row.before as { games?: Game[] } | null;
    const after = row.after as { games?: Game[]; reason?: string } | null;
    changeLog.push({
      at: row.createdAt,
      by: row.actor?.name ?? '',
      kind: row.action === CORRECT_ACTION ? 'correct' : 'confirmed',
      ...(before?.games ? { before: before.games } : {}),
      ...(after?.games ? { after: after.games } : {}),
      ...(after?.reason ? { reason: after.reason } : {}),
    });
  }
  return {
    status: desk.match.status,
    version: desk.match.version,
    umpire: { name: last?.umpire.displayName ?? '', games, sentAt: last?.createdAt ?? null },
    games: current,
    corrected: audit.some((a) => a.action === CORRECT_ACTION),
    changeLog,
  };
}

/** Open take-over alerts of a tournament, for the desk badge and panel. */
export async function deskAlerts(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const alerts = await prisma.deskAlert.findMany({
    where: { status: 'OPEN', takeoverRequest: { fromUmpire: { tournamentId } } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      court: {
        select: {
          number: true,
          slots: {
            where: { tournamentId, match: { status: 'IN_PROGRESS' } },
            take: 1,
            select: { matchId: true },
          },
        },
      },
      takeoverRequest: {
        select: {
          createdAt: true,
          fromUmpire: { select: { displayName: true } },
          toUmpire: { select: { displayName: true } },
        },
      },
    },
  });
  return Promise.all(
    alerts.map(async (a) => {
      const matchId = a.court.slots[0]?.matchId ?? null;
      const games = matchId ? await umpireGames(prisma, await loadDeskMatch(prisma, matchId)) : [];
      return {
        id: a.id,
        courtNumber: a.court.number,
        requestedAt: a.takeoverRequest.createdAt,
        requester: a.takeoverRequest.fromUmpire.displayName,
        holder: a.takeoverRequest.toUmpire.displayName,
        matchId,
        games,
      };
    }),
  );
}

/**
 * The desk decides a timed-out take-over: keep the umpire who holds the court, or give it to
 * the one who asked. An alert resolves once; the second attempt is refused and changes nothing.
 */
export async function resolveDeskAlert(
  actor: Actor,
  alertId: string,
  resolution: 'KEEP_CURRENT' | 'ASSIGN_RESERVE',
  meta: RequestMeta,
): Promise<void> {
  if (resolution !== 'KEEP_CURRENT' && resolution !== 'ASSIGN_RESERVE') {
    throw new AppError('validation');
  }
  const alert = await prisma.deskAlert.findUnique({
    where: { id: alertId },
    select: {
      id: true,
      courtId: true,
      takeoverRequest: {
        select: { fromUmpireId: true, fromUmpire: { select: { tournamentId: true } } },
      },
    },
  });
  if (!alert) throw new AppError('notFound');
  await assertCanManageTournament(actor, alert.takeoverRequest.fromUmpire.tournamentId);
  await transaction(async (tx) => {
    // The status flip is the lock: only one caller can move OPEN to RESOLVED.
    const { count } = await tx.deskAlert.updateMany({
      where: { id: alertId, status: 'OPEN' },
      data: { status: 'RESOLVED' },
    });
    if (count === 0) throw new AppError('alertResolved');
    if (resolution === 'ASSIGN_RESERVE') {
      const requesterId = alert.takeoverRequest.fromUmpireId;
      try {
        await activeUmpire(requesterId, tx);
      } catch {
        // The requester can no longer score: the alert stays open for another decision.
        throw new AppError('statusTransition');
      }
      await assertNoOtherHold(tx, requesterId, alert.courtId);
      await tx.courtHold.upsert({
        where: { courtId: alert.courtId },
        create: { courtId: alert.courtId, umpireId: requesterId },
        update: { umpireId: requesterId, since: new Date() },
      });
    }
    await writeAudit(tx, {
      actorId: actor.userId,
      action: RESOLVE_ACTION,
      entityType: 'DeskAlert',
      entityId: alertId,
      after: { resolution, courtId: alert.courtId },
      meta,
    });
  });
}
