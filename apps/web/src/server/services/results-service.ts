/**
 * Results (Phase 6c, D57). Admins and the tournament's organisers enter scores at the desk.
 * A result moves the winner on (and in a double knockout the loser into the losers bracket);
 * a correction is allowed while the next match hasn't started. Groups, hybrid rankings and
 * Swiss rounds lead to the next stage once their matches are done. Desk check-in marks who
 * is present; a no-show is recorded as a walkover.
 */
import { prisma, type Prisma } from '@tourneasy/db';
import {
  checkMatchScore,
  rulesForMatch,
  nextPowerOfTwo,
  placeKnockout,
  knockoutPlan,
  standings,
  swissPairing,
  swissRoundCount,
  type DrawCandidate,
  type Game,
  type ResultForStandings,
  type Standing,
} from '@tourneasy/shared';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { advance, resolveByes } from './draw-service';
import { assertCanManageTournament } from './permissions';
import { fullName } from './registration-service';
import type { Actor } from './session-service';

type Tx = Prisma.TransactionClient;
const DONE = ['COMPLETED', 'WALKOVER', 'RETIRED', 'BYE'] as const;

async function loadMatch(matchId: string, db: Tx | typeof prisma = prisma) {
  const m = await db.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      drawId: true,
      status: true,
      version: true,
      round: true,
      bracket: true,
      winnerEntryId: true,
      entryAId: true,
      entryBId: true,
      nextMatchId: true,
      nextMatchSlot: true,
      loserNextMatchId: true,
      loserNextMatchSlot: true,
      entryA: { select: { registrationId: true } },
      entryB: { select: { registrationId: true } },
      draw: {
        select: {
          status: true,
          stage: true,
          type: true,
          size: true,
          event: {
            select: {
              id: true,
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
  if (!m) throw new AppError('notFound');
  return m;
}
type MatchForResult = Awaited<ReturnType<typeof loadMatch>>;

async function authorise(actor: Actor, matchId: string) {
  const m = await loadMatch(matchId);
  await assertCanManageTournament(actor, m.draw.event.tournamentId);
  if (m.draw.status === 'DRAFT') throw new AppError('drawNotPublished');
  if (!m.entryA?.registrationId || !m.entryB?.registrationId) throw new AppError('matchNotReady');
  return m;
}

/** A follow-up match may still take a different entry when it hasn't started. */
async function assertFollowUpOpen(tx: Tx, matchId: string | null) {
  if (!matchId) return;
  const next = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { status: true },
  });
  if (next.status !== 'SCHEDULED' && next.status !== 'CALLED')
    throw new AppError('nextMatchPlayed');
}

/** Stores the outcome and moves winner and loser on. */
async function finish(
  tx: Tx,
  m: MatchForResult,
  outcome: { winner: 'A' | 'B'; status: 'COMPLETED' | 'WALKOVER' | 'RETIRED'; games: Game[] },
  actor: Actor,
  meta: RequestMeta,
) {
  const winnerId = outcome.winner === 'A' ? m.entryAId! : m.entryBId!;
  const loserId = outcome.winner === 'A' ? m.entryBId! : m.entryAId!;
  if (m.winnerEntryId && m.winnerEntryId !== winnerId) {
    // A correction that changes the winner: the follow-up matches must not have started.
    await assertFollowUpOpen(tx, m.nextMatchId);
    await assertFollowUpOpen(tx, m.loserNextMatchId);
  }
  const updated = await tx.match.updateMany({
    where: { id: m.id, version: m.version },
    data: {
      status: outcome.status,
      winnerEntryId: winnerId,
      completedAt: new Date(),
      resultEnteredById: actor.userId,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) throw new AppError('resultConflict');
  await tx.matchSet.deleteMany({ where: { matchId: m.id } });
  if (outcome.games.length) {
    await tx.matchSet.createMany({
      data: outcome.games.map(([scoreA, scoreB], i) => ({
        matchId: m.id,
        setNumber: i + 1,
        scoreA,
        scoreB,
      })),
    });
  }
  await advance(tx, m.nextMatchId, m.nextMatchSlot, winnerId);
  await advance(tx, m.loserNextMatchId, m.loserNextMatchSlot, loserId);
  await resolveByes(tx, m.drawId);
  await writeAudit(tx, {
    actorId: actor.userId,
    action: m.winnerEntryId ? 'match.correct' : 'match.result',
    entityType: 'Match',
    entityId: m.id,
    after: { status: outcome.status, winner: outcome.winner, games: outcome.games },
    meta,
  });
}

const gamesSchema = z.object({
  games: z
    .array(
      z.tuple([z.coerce.number().int().min(0).max(99), z.coerce.number().int().min(0).max(99)]),
    )
    .max(5),
  version: z.coerce.number().int().optional(),
});

/** A normal result: every game's score, checked against the category's scoring rules. */
export async function recordResult(
  actor: Actor,
  matchId: string,
  input: unknown,
  meta: RequestMeta,
) {
  const m = await authorise(actor, matchId);
  const { games, version } = parseInput(gamesSchema, input);
  if (version !== undefined && version !== m.version) throw new AppError('resultConflict');
  // The category's scoring, or its knockout scoring for this round (D61).
  const rules = rulesForMatch(m.draw.event, { ...m.draw, round: m.round, bracket: m.bracket });
  const check = checkMatchScore(games as Game[], rules);
  if (!check.ok)
    throw validationError({
      games: check.error,
      ...(check.game ? { game: String(check.game) } : {}),
    });
  await prisma.$transaction((tx) =>
    finish(
      tx,
      m,
      { winner: check.winner, status: 'COMPLETED', games: games as Game[] },
      actor,
      meta,
    ),
  );
}

const sideSchema = z.object({ winner: z.enum(['A', 'B']) });

/** Walkover (no-show, or withdrawn after the draw): the other side wins without playing. */
export async function recordWalkover(
  actor: Actor,
  matchId: string,
  input: unknown,
  meta: RequestMeta,
) {
  const m = await authorise(actor, matchId);
  const { winner } = parseInput(sideSchema, input);
  await prisma.$transaction((tx) =>
    finish(tx, m, { winner, status: 'WALKOVER', games: [] }, actor, meta),
  );
}

/** Retirement during the match: the score so far is kept, the other side wins. */
export async function recordRetirement(
  actor: Actor,
  matchId: string,
  input: unknown,
  meta: RequestMeta,
) {
  const m = await authorise(actor, matchId);
  const { winner } = parseInput(sideSchema, input);
  const { games } = parseInput(gamesSchema, input);
  await prisma.$transaction((tx) =>
    finish(tx, m, { winner, status: 'RETIRED', games: games as Game[] }, actor, meta),
  );
}

/** "On court": the match has been called and is being played (for the live view). */
export async function startMatch(actor: Actor, matchId: string, meta: RequestMeta) {
  const m = await authorise(actor, matchId);
  if (m.status !== 'SCHEDULED' && m.status !== 'CALLED') throw new AppError('statusTransition');
  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: m.id },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'match.start',
      entityType: 'Match',
      entityId: m.id,
      meta,
    });
  });
}

/** Desk check-in of one player (each partner checks in separately). */
export async function setCheckIn(
  actor: Actor,
  participantId: string,
  present: boolean,
  meta: RequestMeta,
) {
  const p = await prisma.registrationParticipant.findUnique({
    where: { id: participantId },
    select: { id: true, registration: { select: { event: { select: { tournamentId: true } } } } },
  });
  if (!p) throw new AppError('notFound');
  await assertCanManageTournament(actor, p.registration.event.tournamentId);
  await prisma.$transaction(async (tx) => {
    await tx.registrationParticipant.update({
      where: { id: participantId },
      data: present
        ? { checkedInAt: new Date(), checkedInById: actor.userId }
        : { checkedInAt: null, checkedInById: null },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: present ? 'checkin.in' : 'checkin.undo',
      entityType: 'RegistrationParticipant',
      entityId: participantId,
      meta,
    });
  });
}

// ── Standings and next stages ──────────────────────────────────────────────────────

const standingSelect = {
  id: true,
  type: true,
  stage: true,
  name: true,
  groupNumber: true,
  entries: { orderBy: { position: 'asc' }, select: { id: true, registrationId: true, seed: true } },
  matches: {
    select: {
      round: true,
      status: true,
      entryAId: true,
      entryBId: true,
      winnerEntryId: true,
      sets: { orderBy: { setNumber: 'asc' }, select: { scoreA: true, scoreB: true } },
    },
  },
} satisfies Prisma.DrawSelect;
type StandingDraw = Prisma.DrawGetPayload<{ select: typeof standingSelect }>;

/** Standings of an all-play-all draw (group, round robin, hybrid or Swiss) by draw entry. */
export function drawStandings(draw: StandingDraw, bestOf = 3): Standing[] {
  const real = draw.entries.filter((e) => e.registrationId).map((e) => e.id);
  const results: ResultForStandings[] = draw.matches
    .filter((m) => m.winnerEntryId && m.entryAId && m.entryBId && m.status !== 'BYE')
    .map((m) => ({
      a: m.entryAId!,
      b: m.entryBId!,
      winner: m.winnerEntryId,
      games: m.sets.map((s) => [s.scoreA, s.scoreB] as Game),
      walkover: m.status === 'WALKOVER',
    }));
  // Swiss byes count as a win.
  const byes = draw.matches.filter((m) => m.status === 'BYE' && m.winnerEntryId);
  const rows = standings(real, results, { bestOf });
  for (const b of byes) {
    const row = rows.find((r) => r.id === b.winnerEntryId);
    if (row) row.won += 1;
  }
  return byes.length ? rows.sort((x, y) => y.won - x.won) : rows;
}

async function eventForStage(actor: Actor, eventId: string) {
  const event = await prisma.tournamentEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true,
      tournamentId: true,
      drawType: true,
      advancePerGroup: true,
      knockoutSize: true,
      bestOf: true,
    },
  });
  if (!event) throw new AppError('notFound');
  await assertCanManageTournament(actor, event.tournamentId);
  return event;
}

/** Creates a published knockout stage from qualifiers in order (best first = top seeds). */
async function createKnockoutStage(
  tx: Tx,
  eventId: string,
  qualifiers: { registrationId: string; group: string }[],
  seedCount: number,
) {
  const candidates: DrawCandidate[] = qualifiers.map((q) => ({
    id: q.registrationId,
    strength: null,
    // Same group = same "club": keeps group mates apart in round one.
    clubs: [q.group],
    enteredAt: new Date(0),
  }));
  const seeds = qualifiers.slice(0, seedCount).map((q) => q.registrationId);
  const slots = placeKnockout(candidates, seeds, Math.random);
  const size = slots.length;
  const draw = await tx.draw.create({
    data: {
      eventId,
      type: 'KNOCKOUT',
      stage: 'KNOCKOUT',
      size,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  const entryIds: string[] = [];
  for (const [i, registrationId] of slots.entries()) {
    const e = await tx.drawEntry.create({
      data: {
        drawId: draw.id,
        position: i + 1,
        registrationId,
        seed:
          registrationId && seeds.includes(registrationId)
            ? seeds.indexOf(registrationId) + 1
            : null,
      },
    });
    entryIds.push(e.id);
  }
  const plan = knockoutPlan(size);
  const idOf = new Map<number, string>();
  for (const p of plan) {
    const m = await tx.match.create({
      data: {
        drawId: draw.id,
        matchNumber: p.number,
        round: p.round,
        entryAId: p.a ? entryIds[p.a - 1] : null,
        entryBId: p.b ? entryIds[p.b - 1] : null,
      },
    });
    idOf.set(p.number, m.id);
  }
  for (const p of plan) {
    if (!p.next) continue;
    await tx.match.update({
      where: { id: idOf.get(p.number)! },
      data: { nextMatchId: idOf.get(p.next.match), nextMatchSlot: p.next.slot },
    });
  }
  await resolveByes(tx, draw.id);
}

/** Groups done → knockout with the best `advancePerGroup` of each group (group winners seeded). */
export async function createKnockoutFromGroups(actor: Actor, eventId: string, meta: RequestMeta) {
  const event = await eventForStage(actor, eventId);
  const draws = await prisma.draw.findMany({
    where: { eventId, stage: { in: ['GROUP', 'MAIN'] }, status: { not: 'DRAFT' } },
    orderBy: { groupNumber: 'asc' },
    select: standingSelect,
  });
  if (event.drawType !== 'GROUPS_KNOCKOUT' && event.drawType !== 'HYBRID_ROUND_ROBIN_KNOCKOUT')
    throw new AppError('statusTransition');
  if (await prisma.draw.count({ where: { eventId, stage: 'KNOCKOUT' } }))
    throw new AppError('stageExists');
  if (
    draws.length === 0 ||
    draws.some((d) => d.matches.some((m) => !DONE.includes(m.status as never)))
  )
    throw new AppError('stageNotFinished');

  const regOf = (draw: StandingDraw, entryId: string) =>
    draw.entries.find((e) => e.id === entryId)!.registrationId!;
  let qualifiers: { registrationId: string; group: string }[];
  let seedCount: number;
  if (event.drawType === 'GROUPS_KNOCKOUT') {
    const per = event.advancePerGroup ?? 2;
    const tables = draws.map((d) => ({ d, rows: drawStandings(d, event.bestOf) }));
    // All group winners first (A1, B1, …), then all runners-up (A2, B2, …).
    qualifiers = [];
    for (let place = 0; place < per; place++) {
      for (const { d, rows } of tables) {
        if (rows[place])
          qualifiers.push({ registrationId: regOf(d, rows[place]!.id), group: d.id });
      }
    }
    seedCount = draws.length;
  } else {
    const d = draws[0]!;
    const rows = drawStandings(d, event.bestOf);
    const size = Math.min(
      event.knockoutSize ?? 16,
      2 ** Math.floor(Math.log2(Math.max(2, rows.length))),
    );
    qualifiers = rows
      .slice(0, size)
      .map((r, i) => ({ registrationId: regOf(d, r.id), group: `rank${i}` }));
    seedCount = Math.min(size, nextPowerOfTwo(size) >= 16 ? 8 : size / 2);
  }
  await prisma.$transaction(
    async (tx) => {
      await createKnockoutStage(tx, eventId, qualifiers, seedCount);
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'draw.knockoutStage',
        entityType: 'TournamentEvent',
        entityId: eventId,
        after: { qualifiers: qualifiers.length },
        meta,
      });
    },
    { timeout: 30_000 },
  );
}

/** Swiss: pairs the next round from the standings once the current round is done. */
export async function nextSwissRound(actor: Actor, eventId: string, meta: RequestMeta) {
  const event = await eventForStage(actor, eventId);
  if (event.drawType !== 'SWISS') throw new AppError('statusTransition');
  const draw = await prisma.draw.findFirst({
    where: { eventId, status: { not: 'DRAFT' } },
    select: standingSelect,
  });
  if (!draw) throw new AppError('notFound');
  if (draw.matches.some((m) => !DONE.includes(m.status as never)))
    throw new AppError('stageNotFinished');
  const real = draw.entries.filter((e) => e.registrationId);
  const round = Math.max(0, ...draw.matches.map((m) => m.round));
  if (round >= swissRoundCount(real.length)) throw new AppError('stageExists');
  const order = drawStandings(draw, event.bestOf).map((r) => r.id);
  const met = new Set(
    draw.matches
      .filter((m) => m.entryAId && m.entryBId)
      .map((m) => [m.entryAId, m.entryBId].sort().join('|')),
  );
  const hadBye = new Set(
    draw.matches.filter((m) => m.status === 'BYE').map((m) => m.winnerEntryId!),
  );
  const { pairs, bye } = swissPairing(order, (a, b) => met.has([a, b].sort().join('|')), hadBye);
  await prisma.$transaction(async (tx) => {
    let number = Math.max(
      0,
      ...(
        await tx.match.findMany({ where: { drawId: draw.id }, select: { matchNumber: true } })
      ).map((m) => m.matchNumber),
    );
    for (const [a, b] of pairs) {
      number += 1;
      await tx.match.create({
        data: { drawId: draw.id, matchNumber: number, round: round + 1, entryAId: a, entryBId: b },
      });
    }
    if (bye) {
      const byeEntry =
        draw.entries.find((e) => !e.registrationId) ??
        (await tx.drawEntry.create({
          data: { drawId: draw.id, position: draw.entries.length + 1, registrationId: null },
        }));
      number += 1;
      await tx.match.create({
        data: {
          drawId: draw.id,
          matchNumber: number,
          round: round + 1,
          entryAId: bye,
          entryBId: byeEntry.id,
        },
      });
      await resolveByes(tx, draw.id);
    }
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'draw.swissRound',
      entityType: 'TournamentEvent',
      entityId: eventId,
      after: { round: round + 1 },
      meta,
    });
  });
}

/** What the organiser can do next per event (for the desk page). */
export async function stageStatus(eventId: string) {
  const event = await prisma.tournamentEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { drawType: true },
  });
  const draws = await prisma.draw.findMany({
    where: { eventId, status: { not: 'DRAFT' } },
    select: {
      stage: true,
      matches: { select: { status: true, round: true } },
      entries: { select: { registrationId: true } },
    },
  });
  const groupsDone =
    draws.length > 0 &&
    draws
      .filter((d) => d.stage !== 'KNOCKOUT')
      .every((d) => d.matches.every((m) => DONE.includes(m.status as never)));
  const hasKnockout = draws.some((d) => d.stage === 'KNOCKOUT');
  const canKnockout =
    (event.drawType === 'GROUPS_KNOCKOUT' || event.drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT') &&
    groupsDone &&
    !hasKnockout;
  const swiss = event.drawType === 'SWISS' ? draws[0] : undefined;
  const canNextSwissRound =
    !!swiss &&
    groupsDone &&
    Math.max(0, ...swiss.matches.map((m) => m.round)) <
      swissRoundCount(swiss.entries.filter((e) => e.registrationId).length);
  return { canKnockout, canNextSwissRound };
}

// ── Results for display ────────────────────────────────────────────────────────────

const podiumEntry = {
  select: {
    registration: {
      select: {
        participants: {
          where: { active: true },
          orderBy: { role: 'asc' },
          select: { player: { select: { firstName: true, lastNamePrefix: true, lastName: true } } },
        },
      },
    },
  },
} as const;

/** Podium per event once its final is played (or all-play-all is finished). */
export async function eventPodium(eventId: string) {
  const event = await prisma.tournamentEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { drawType: true, bestOf: true, prizePlaces: true },
  });
  // Two prize places: no third place shown or mailed.
  const thirds = (names: (string | null)[]) =>
    event.prizePlaces >= 3 ? (names.filter(Boolean) as string[]) : [];
  const draws = await prisma.draw.findMany({
    where: { eventId, status: { not: 'DRAFT' } },
    select: {
      ...standingSelect,
      size: true,
      matches: {
        select: {
          ...standingSelect.matches.select,
          bracket: true,
          entryA: podiumEntry,
          entryB: podiumEntry,
        },
      },
      entries: {
        orderBy: { position: 'asc' },
        select: { id: true, registrationId: true, seed: true, ...podiumEntry.select },
      },
    },
  });
  const name = (
    e:
      | { registration: { participants: { player: Parameters<typeof fullName>[0] }[] } | null }
      | null
      | undefined,
  ) =>
    e?.registration ? e.registration.participants.map((p) => fullName(p.player)).join(' / ') : null;
  const ko = draws.find((d) => d.type === 'KNOCKOUT' || d.type === 'DOUBLE_KNOCKOUT');
  if (ko) {
    const final =
      ko.type === 'DOUBLE_KNOCKOUT'
        ? ko.matches.find((m) => m.bracket === 'F')
        : ko.matches.find((m) => m.round === Math.log2(ko.size));
    if (!final?.winnerEntryId) return null;
    const winnerIsA = final.winnerEntryId === final.entryAId;
    const first = name(winnerIsA ? final.entryA : final.entryB);
    const second = name(winnerIsA ? final.entryB : final.entryA);
    const third =
      ko.type === 'DOUBLE_KNOCKOUT'
        ? ko.matches
            .filter(
              (m) =>
                m.bracket === 'L' &&
                m.round ===
                  Math.max(...ko.matches.filter((x) => x.bracket === 'L').map((x) => x.round)),
            )
            .map((m) => name(m.winnerEntryId === m.entryAId ? m.entryB : m.entryA))
        : ko.matches
            .filter((m) => m.round === Math.log2(ko.size) - 1 && m.status !== 'BYE')
            .map((m) => name(m.winnerEntryId === m.entryAId ? m.entryB : m.entryA));
    return { first, second, third: thirds(third) };
  }
  if (draws.length === 1 && (event.drawType === 'ROUND_ROBIN' || event.drawType === 'SWISS')) {
    const d = draws[0]!;
    if (d.matches.some((m) => !DONE.includes(m.status as never))) return null;
    if (
      event.drawType === 'SWISS' &&
      Math.max(0, ...d.matches.map((m) => m.round)) <
        swissRoundCount(d.entries.filter((e) => e.registrationId).length)
    )
      return null;
    const rows = drawStandings(d, event.bestOf);
    const at = (i: number) => name(d.entries.find((e) => e.id === rows[i]?.id));
    return { first: at(0), second: at(1), third: thirds([at(2)]) };
  }
  return null;
}

/** A player's played matches (newest first) for their profile and dashboard. */
export async function playerHistory(playerId: string, take = 30) {
  const mine = { registration: { participants: { some: { playerId, active: true } } } };
  const matches = await prisma.match.findMany({
    where: {
      status: { in: ['COMPLETED', 'WALKOVER', 'RETIRED'] },
      draw: { status: { not: 'DRAFT' } },
      OR: [{ entryA: mine }, { entryB: mine }],
    },
    orderBy: { completedAt: 'desc' },
    take,
    select: {
      id: true,
      status: true,
      completedAt: true,
      winnerEntryId: true,
      entryAId: true,
      sets: { orderBy: { setNumber: 'asc' }, select: { scoreA: true, scoreB: true } },
      entryA: {
        select: {
          id: true,
          ...podiumEntry.select,
          registration: {
            select: {
              participants: {
                where: { active: true },
                select: {
                  playerId: true,
                  player: { select: { firstName: true, lastNamePrefix: true, lastName: true } },
                },
              },
            },
          },
        },
      },
      entryB: {
        select: {
          id: true,
          registration: {
            select: {
              participants: {
                where: { active: true },
                select: {
                  playerId: true,
                  player: { select: { firstName: true, lastNamePrefix: true, lastName: true } },
                },
              },
            },
          },
        },
      },
      draw: {
        select: {
          event: {
            select: {
              discipline: true,
              name: true,
              ageCategory: { select: { code: true, name: true } },
              levelClass: { select: { code: true } },
              tournament: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });
  return matches.map((m) => {
    const iAmA = !!m.entryA?.registration?.participants.some((p) => p.playerId === playerId);
    const opp = iAmA ? m.entryB : m.entryA;
    const won = m.winnerEntryId === (iAmA ? m.entryAId : m.entryB?.id);
    return {
      id: m.id,
      date: m.completedAt,
      event: m.draw.event,
      tournament: m.draw.event.tournament,
      opponent: opp?.registration?.participants.map((p) => fullName(p.player)).join(' / ') ?? '—',
      won,
      walkover: m.status === 'WALKOVER',
      retired: m.status === 'RETIRED',
      score: m.sets
        .map((s) => (iAmA ? `${s.scoreA}-${s.scoreB}` : `${s.scoreB}-${s.scoreA}`))
        .join(', '),
    };
  });
}

/** My played matches (dashboard). */
export async function myHistory(actor: { userId: string }) {
  const player = await prisma.playerProfile.findFirst({
    where: { userId: actor.userId, deletedAt: null },
    select: { id: true },
  });
  return player ? playerHistory(player.id) : [];
}

/** Played matches by member number (public player page; the page checks the profile is public). */
export async function historyByMemberNumber(memberNumber: string) {
  const player = await prisma.playerProfile.findFirst({
    where: { memberNumber, deletedAt: null },
    select: { id: true },
  });
  return player ? playerHistory(player.id) : [];
}
