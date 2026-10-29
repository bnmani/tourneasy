/**
 * Draws (Phase 6a, D55). Per event the organiser sets seeds (the system suggests them by
 * level), generates a draft draw in the event's format, can swap entries, and publishes it.
 * Byes are stored as DrawEntry rows without a registration and resolve automatically.
 * Knockout stages after groups / hybrid rankings and later Swiss rounds follow results (6c).
 */
import { prisma, type Discipline, type DrawType, type Prisma } from '@tourneasy/db';
import {
  defaultSeedCount,
  distributeGroups,
  doubleKnockoutPlan,
  hybridRounds,
  isDoubles,
  knockoutPlan,
  placeKnockout,
  roundRobinRounds,
  shuffle,
  suggestSeedOrder,
  swissFirstRound,
  type DrawCandidate,
  type MatchPlan,
  type Rng,
} from '@tourneasy/shared';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { assertCanManageTournament } from './permissions';
import { eventText, fullName } from './registration-service';
import type { Actor } from './session-service';

type Tx = Prisma.TransactionClient;

const levelFor = (d: Discipline) =>
  d === 'HE' || d === 'DE' ? 'levelSingles' : d === 'GD' ? 'levelMixed' : 'levelDoubles';

const playerSelect = {
  id: true,
  memberNumber: true,
  firstName: true,
  lastNamePrefix: true,
  lastName: true,
  clubId: true,
  club: { select: { name: true, shortName: true } },
  levelSingles: { select: { code: true, rank: true } },
  levelDoubles: { select: { code: true, rank: true } },
  levelMixed: { select: { code: true, rank: true } },
} satisfies Prisma.PlayerProfileSelect;

async function loadEvent(eventId: string) {
  const event = await prisma.tournamentEvent.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true,
      tournamentId: true,
      discipline: true,
      name: true,
      drawType: true,
      groupSize: true,
      advancePerGroup: true,
      matchesPerEntry: true,
      knockoutSize: true,
      ageCategory: { select: { code: true, name: true } },
      levelClass: { select: { code: true } },
      tournament: {
        select: { id: true, name: true, slug: true, registrationClosesAt: true },
      },
    },
  });
  if (!event) throw new AppError('notFound');
  return event;
}

/** Confirmed entries of an event with what the draw needs (names, clubs, level strength). */
async function drawEntries(event: Awaited<ReturnType<typeof loadEvent>>) {
  const rows = await prisma.registration.findMany({
    where: { eventId: event.id, status: 'CONFIRMED' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      seed: true,
      createdAt: true,
      participants: {
        where: { active: true },
        orderBy: { role: 'asc' },
        select: { player: { select: playerSelect } },
      },
    },
  });
  const level = levelFor(event.discipline);
  const doubles = isDoubles(event.discipline);
  return rows.map((r) => {
    const players = r.participants.map((p) => p.player);
    const ranks = players
      .map((p) => p[level]?.rank)
      .filter((x): x is number => typeof x === 'number');
    return {
      id: r.id,
      seed: r.seed,
      createdAt: r.createdAt,
      complete: !doubles || players.length === 2,
      name: players.map(fullName).join(' / '),
      players: players.map((p) => ({
        name: fullName(p),
        memberNumber: p.memberNumber,
        club: p.club?.shortName ?? p.club?.name ?? null,
        level: p[level]?.code ?? null,
      })),
      candidate: {
        id: r.id,
        strength: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
        clubs: players.map((p) => p.clubId).filter((c): c is string => !!c),
        enteredAt: r.createdAt,
      } satisfies DrawCandidate,
    };
  });
}

const drawInclude = {
  entries: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      seed: true,
      registrationId: true,
      registration: {
        select: {
          participants: {
            where: { active: true },
            orderBy: { role: 'asc' },
            select: {
              player: {
                select: {
                  memberNumber: true,
                  firstName: true,
                  lastNamePrefix: true,
                  lastName: true,
                  dateOfBirth: true,
                  club: { select: { name: true, shortName: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  matches: {
    orderBy: { matchNumber: 'asc' },
    select: {
      id: true,
      matchNumber: true,
      round: true,
      bracket: true,
      status: true,
      entryAId: true,
      entryBId: true,
      winnerEntryId: true,
      sets: { orderBy: { setNumber: 'asc' }, select: { scoreA: true, scoreB: true } },
    },
  },
} satisfies Prisma.DrawInclude;

async function eventDraws(eventId: string, published = false) {
  return prisma.draw.findMany({
    where: { eventId, ...(published ? { status: { not: 'DRAFT' } } : {}) },
    orderBy: [{ stage: 'asc' }, { groupNumber: 'asc' }],
    include: drawInclude,
  });
}
export type EventDraw = Awaited<ReturnType<typeof eventDraws>>[number];

/** Organiser page: entries with seeds and suggestion, and the current draw (draft or published). */
export async function getDrawSetup(actor: Actor, eventId: string) {
  const event = await loadEvent(eventId);
  await assertCanManageTournament(actor, event.tournamentId);
  const [entries, draws] = await Promise.all([drawEntries(event), eventDraws(eventId)]);
  const complete = entries.filter((e) => e.complete);
  const suggestion = suggestSeedOrder(complete.map((e) => e.candidate));
  const inDraw = new Set(draws.flatMap((d) => d.entries.map((e) => e.registrationId)));
  return {
    event: {
      id: event.id,
      label: eventText(event, actor.locale),
      drawType: event.drawType,
      groupSize: event.groupSize,
      advancePerGroup: event.advancePerGroup,
      matchesPerEntry: event.matchesPerEntry,
      knockoutSize: event.knockoutSize,
      tournament: event.tournament,
    },
    entries: entries.map(({ candidate, ...e }) => ({
      ...e,
      strength: candidate.strength,
      suggestedRank: suggestion.indexOf(e.id) + 1 || null,
    })),
    defaultSeeds: defaultSeedsFor(event, complete.length),
    draws,
    status:
      draws.length === 0 ? 'NONE' : draws.some((d) => d.status !== 'DRAFT') ? 'PUBLISHED' : 'DRAFT',
    // Entries changed since the draw was made (withdrawals, late entries).
    outOfDate:
      draws.length > 0 &&
      (complete.some((e) => !inDraw.has(e.id)) ||
        [...inDraw].some((id) => id && !complete.some((e) => e.id === id))),
    entriesOpen: new Date() < event.tournament.registrationClosesAt,
  };
}

function defaultSeedsFor(event: { drawType: DrawType; groupSize: number | null }, count: number) {
  if (event.drawType === 'GROUPS_KNOCKOUT')
    return Math.min(count, Math.ceil(count / (event.groupSize ?? 4)));
  if (event.drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT' || event.drawType === 'ROUND_ROBIN')
    return 0;
  return defaultSeedCount(count);
}

async function assertDraft(eventId: string) {
  const published = await prisma.draw.count({ where: { eventId, status: { not: 'DRAFT' } } });
  if (published > 0) throw new AppError('drawPublished');
}

const seedsSchema = z.object({
  seeds: z
    .array(
      z.object({
        registrationId: z.string().uuid(),
        seed: z.number().int().min(1).max(64).nullable(),
      }),
    )
    .max(1024),
});

/** Sets the seeds by hand (1, 2, 3 … without gaps or doubles). */
export async function setSeeds(actor: Actor, eventId: string, input: unknown, meta: RequestMeta) {
  const event = await loadEvent(eventId);
  await assertCanManageTournament(actor, event.tournamentId);
  await assertDraft(eventId);
  const { seeds } = parseInput(seedsSchema, input);
  const numbers = seeds
    .map((s) => s.seed)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1)) throw validationError({ seeds: 'seedOrder' });
  await prisma.$transaction(async (tx) => {
    await tx.registration.updateMany({ where: { eventId }, data: { seed: null } });
    for (const s of seeds.filter((x) => x.seed !== null)) {
      await tx.registration.updateMany({
        where: { id: s.registrationId, eventId },
        data: { seed: s.seed },
      });
    }
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'draw.seeds',
      entityType: 'TournamentEvent',
      entityId: eventId,
      after: { seeds: numbers.length },
      meta,
    });
  });
}

/** Seeds the strongest `count` entries by level (D55); the organiser can still change them. */
export async function applySuggestedSeeds(
  actor: Actor,
  eventId: string,
  count: number,
  meta: RequestMeta,
) {
  const event = await loadEvent(eventId);
  await assertCanManageTournament(actor, event.tournamentId);
  const entries = (await drawEntries(event)).filter((e) => e.complete);
  const order = suggestSeedOrder(entries.map((e) => e.candidate)).slice(
    0,
    Math.max(0, Math.min(count, entries.length)),
  );
  await setSeeds(
    actor,
    eventId,
    {
      seeds: entries.map((e) => ({ registrationId: e.id, seed: order.indexOf(e.id) + 1 || null })),
    },
    meta,
  );
}

// ── Generating ─────────────────────────────────────────────────────────────────────

/** Creates the draw entries (byes included) and the matches of one knockout draw. */
async function createKnockout(
  tx: Tx,
  eventId: string,
  type: 'KNOCKOUT' | 'DOUBLE_KNOCKOUT',
  slots: (string | null)[],
  seedOf: Map<string, number>,
) {
  const size = slots.length;
  const draw = await tx.draw.create({ data: { eventId, type, stage: 'MAIN', size } });
  const entryIds: string[] = [];
  for (const [i, registrationId] of slots.entries()) {
    const e = await tx.drawEntry.create({
      data: {
        drawId: draw.id,
        position: i + 1,
        registrationId,
        seed: registrationId ? (seedOf.get(registrationId) ?? null) : null,
      },
    });
    entryIds.push(e.id);
  }
  const plan = type === 'KNOCKOUT' ? knockoutPlan(size) : doubleKnockoutPlan(size);
  await createPlannedMatches(tx, draw.id, plan, entryIds);
  await resolveByes(tx, draw.id);
  return draw.id;
}

async function createPlannedMatches(tx: Tx, drawId: string, plan: MatchPlan[], entryIds: string[]) {
  const idOf = new Map<number, string>();
  for (const p of plan) {
    const m = await tx.match.create({
      data: {
        drawId,
        matchNumber: p.number,
        round: p.round,
        bracket: p.bracket,
        entryAId: p.a ? entryIds[p.a - 1] : null,
        entryBId: p.b ? entryIds[p.b - 1] : null,
      },
    });
    idOf.set(p.number, m.id);
  }
  for (const p of plan) {
    if (!p.next && !p.loserNext) continue;
    await tx.match.update({
      where: { id: idOf.get(p.number)! },
      data: {
        nextMatchId: p.next ? idOf.get(p.next.match) : null,
        nextMatchSlot: p.next?.slot ?? null,
        loserNextMatchId: p.loserNext ? idOf.get(p.loserNext.match) : null,
        loserNextMatchSlot: p.loserNext?.slot ?? null,
      },
    });
  }
}

/**
 * Plays out matches against a bye: the real entry advances (a bye against a bye sends a bye
 * on), the bye drops into the losers bracket. Repeats until nothing changes.
 */
export async function resolveByes(tx: Tx, drawId: string) {
  for (;;) {
    const open = await tx.match.findMany({
      where: { drawId, status: 'SCHEDULED', entryAId: { not: null }, entryBId: { not: null } },
      select: {
        id: true,
        nextMatchId: true,
        nextMatchSlot: true,
        loserNextMatchId: true,
        loserNextMatchSlot: true,
        entryA: { select: { id: true, registrationId: true } },
        entryB: { select: { id: true, registrationId: true } },
      },
    });
    const byes = open.filter((m) => !m.entryA!.registrationId || !m.entryB!.registrationId);
    if (byes.length === 0) return;
    for (const m of byes) {
      const aIsBye = !m.entryA!.registrationId;
      const winner = aIsBye ? m.entryB! : m.entryA!;
      const loser = aIsBye ? m.entryA! : m.entryB!;
      await tx.match.update({
        where: { id: m.id },
        data: { status: 'BYE', winnerEntryId: winner.id },
      });
      await advance(tx, m.nextMatchId, m.nextMatchSlot, winner.id);
      await advance(tx, m.loserNextMatchId, m.loserNextMatchSlot, loser.id);
    }
  }
}

/** Puts an entry into the next match's slot (used for byes now, results in 6c). */
export async function advance(
  tx: Tx,
  matchId: string | null,
  slot: string | null,
  entryId: string,
) {
  if (!matchId || !slot) return;
  await tx.match.update({
    where: { id: matchId },
    data: slot === 'A' ? { entryAId: entryId } : { entryBId: entryId },
  });
}

/** One all-play-all draw (a group, or the whole event). */
async function createRoundRobin(
  tx: Tx,
  eventId: string,
  type: DrawType,
  stage: string,
  groupNumber: number | null,
  registrationIds: string[],
  seedOf: Map<string, number>,
) {
  const draw = await tx.draw.create({
    data: {
      eventId,
      type,
      stage,
      groupNumber,
      name: groupNumber ? String.fromCharCode(64 + groupNumber) : null,
      size: registrationIds.length,
    },
  });
  const entryOf = new Map<string, string>();
  for (const [i, registrationId] of registrationIds.entries()) {
    const e = await tx.drawEntry.create({
      data: {
        drawId: draw.id,
        position: i + 1,
        registrationId,
        seed: seedOf.get(registrationId) ?? null,
      },
    });
    entryOf.set(registrationId, e.id);
  }
  let number = 0;
  for (const [r, pairs] of roundRobinRounds(registrationIds).entries()) {
    for (const [a, b] of pairs) {
      number += 1;
      await tx.match.create({
        data: {
          drawId: draw.id,
          matchNumber: number,
          round: r + 1,
          entryAId: entryOf.get(a)!,
          entryBId: entryOf.get(b)!,
        },
      });
    }
  }
  return draw.id;
}

/** Generates a new draft draw for an event in its format (replacing an earlier draft). */
export async function generateDraw(
  actor: Actor,
  eventId: string,
  meta: RequestMeta,
  rng: Rng = Math.random,
) {
  const event = await loadEvent(eventId);
  await assertCanManageTournament(actor, event.tournamentId);
  await assertDraft(eventId);
  const all = await drawEntries(event);
  const entries = all.filter((e) => e.complete);
  const candidates = entries.map((e) => e.candidate);
  const seeded = entries
    .filter((e) => e.seed !== null)
    .sort((a, b) => a.seed! - b.seed!)
    .map((e) => e.id);
  const seedOf = new Map(entries.filter((e) => e.seed !== null).map((e) => [e.id, e.seed!]));
  const type = event.drawType;
  const minimum =
    type === 'DOUBLE_KNOCKOUT'
      ? 4
      : type === 'HYBRID_ROUND_ROBIN_KNOCKOUT'
        ? (event.matchesPerEntry ?? 3) + 1
        : 2;
  if (entries.length < minimum) throw new AppError('tooFewEntries', { min: minimum });

  await prisma.$transaction(
    async (tx) => {
      await tx.draw.deleteMany({ where: { eventId } });
      if (type === 'KNOCKOUT' || type === 'DOUBLE_KNOCKOUT') {
        await createKnockout(tx, eventId, type, placeKnockout(candidates, seeded, rng), seedOf);
      } else if (type === 'ROUND_ROBIN') {
        await createRoundRobin(
          tx,
          eventId,
          type,
          'MAIN',
          null,
          shuffle(
            entries.map((e) => e.id),
            rng,
          ),
          seedOf,
        );
      } else if (type === 'GROUPS_KNOCKOUT') {
        const groups = distributeGroups(candidates, seeded, event.groupSize ?? 4, rng);
        for (const [i, group] of groups.entries()) {
          await createRoundRobin(tx, eventId, type, 'GROUP', i + 1, group, seedOf);
        }
      } else if (type === 'HYBRID_ROUND_ROBIN_KNOCKOUT') {
        const draw = await tx.draw.create({
          data: { eventId, type, stage: 'GROUP', size: entries.length },
        });
        const entryOf = new Map<string, string>();
        for (const [i, e] of shuffle(entries, rng).entries()) {
          const row = await tx.drawEntry.create({
            data: {
              drawId: draw.id,
              position: i + 1,
              registrationId: e.id,
              seed: seedOf.get(e.id) ?? null,
            },
          });
          entryOf.set(e.id, row.id);
        }
        let number = 0;
        for (const [r, pairs] of hybridRounds(
          candidates,
          event.matchesPerEntry ?? 3,
          rng,
        ).entries()) {
          for (const [a, b] of pairs) {
            number += 1;
            await tx.match.create({
              data: {
                drawId: draw.id,
                matchNumber: number,
                round: r + 1,
                entryAId: entryOf.get(a.id)!,
                entryBId: entryOf.get(b.id)!,
              },
            });
          }
        }
      } else {
        // SWISS: round 1 now (seed order, rest by level); later rounds follow results (6c).
        const order = [
          ...seeded,
          ...suggestSeedOrder(candidates.filter((c) => !seeded.includes(c.id))),
        ];
        const draw = await tx.draw.create({
          data: { eventId, type, stage: 'MAIN', size: order.length },
        });
        const entryOf = new Map<string, string>();
        for (const [i, id] of order.entries()) {
          const row = await tx.drawEntry.create({
            data: {
              drawId: draw.id,
              position: i + 1,
              registrationId: id,
              seed: seedOf.get(id) ?? null,
            },
          });
          entryOf.set(id, row.id);
        }
        const { pairs, bye } = swissFirstRound(order);
        let number = 0;
        for (const [a, b] of pairs) {
          number += 1;
          await tx.match.create({
            data: {
              drawId: draw.id,
              matchNumber: number,
              round: 1,
              entryAId: entryOf.get(a)!,
              entryBId: entryOf.get(b)!,
            },
          });
        }
        if (bye) {
          const byeEntry = await tx.drawEntry.create({
            data: { drawId: draw.id, position: order.length + 1, registrationId: null },
          });
          await tx.match.create({
            data: {
              drawId: draw.id,
              matchNumber: number + 1,
              round: 1,
              entryAId: entryOf.get(bye)!,
              entryBId: byeEntry.id,
            },
          });
          await resolveByes(tx, draw.id);
        }
      }
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'draw.generate',
        entityType: 'TournamentEvent',
        entityId: eventId,
        after: {
          type,
          entries: entries.length,
          seeds: seeded.length,
          skipped: all.length - entries.length,
        },
        meta,
      });
    },
    { timeout: 60_000 },
  );
}

const swapSchema = z.object({ a: z.string().uuid(), b: z.string().uuid() });

/**
 * Swaps two entries (positions, or groups) in a draft draw, then rebuilds that draw's matches.
 */
export async function swapEntries(
  actor: Actor,
  eventId: string,
  input: unknown,
  meta: RequestMeta,
) {
  const event = await loadEvent(eventId);
  await assertCanManageTournament(actor, event.tournamentId);
  await assertDraft(eventId);
  const { a, b } = parseInput(swapSchema, input);
  const rows = await prisma.drawEntry.findMany({
    where: { id: { in: [a, b] }, draw: { eventId } },
    select: { id: true, drawId: true, registrationId: true, seed: true },
  });
  if (rows.length !== 2) throw new AppError('notFound');
  const [x, y] = rows as [(typeof rows)[0], (typeof rows)[0]];
  await prisma.$transaction(
    async (tx) => {
      // Two steps because (drawId, registrationId) is unique.
      await tx.drawEntry.update({ where: { id: x.id }, data: { registrationId: null } });
      await tx.drawEntry.update({
        where: { id: y.id },
        data: { registrationId: x.registrationId, seed: x.seed },
      });
      await tx.drawEntry.update({
        where: { id: x.id },
        data: { registrationId: y.registrationId, seed: y.seed },
      });
      for (const drawId of new Set([x.drawId, y.drawId])) await rebuildMatches(tx, drawId);
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'draw.swap',
        entityType: 'TournamentEvent',
        entityId: eventId,
        after: { a, b },
        meta,
      });
    },
    { timeout: 30_000 },
  );
}

/** Recreates the matches of a draft draw from its current positions. */
async function rebuildMatches(tx: Tx, drawId: string) {
  const draw = await tx.draw.findUniqueOrThrow({
    where: { id: drawId },
    select: {
      id: true,
      type: true,
      size: true,
      entries: { orderBy: { position: 'asc' }, select: { id: true, registrationId: true } },
      matches: {
        select: { round: true, entryAId: true, entryBId: true },
        orderBy: { matchNumber: 'asc' },
      },
    },
  });
  if (draw.type === 'KNOCKOUT' || draw.type === 'DOUBLE_KNOCKOUT') {
    await tx.match.deleteMany({ where: { drawId } });
    const plan = draw.type === 'KNOCKOUT' ? knockoutPlan(draw.size) : doubleKnockoutPlan(draw.size);
    await createPlannedMatches(
      tx,
      drawId,
      plan,
      draw.entries.map((e) => e.id),
    );
    await resolveByes(tx, drawId);
  } else if (draw.type === 'ROUND_ROBIN' || draw.type === 'GROUPS_KNOCKOUT') {
    await tx.match.deleteMany({ where: { drawId } });
    let number = 0;
    for (const [r, pairs] of roundRobinRounds(draw.entries.map((e) => e.id)).entries()) {
      for (const [a, b] of pairs) {
        number += 1;
        await tx.match.create({
          data: { drawId, matchNumber: number, round: r + 1, entryAId: a, entryBId: b },
        });
      }
    }
  }
  // Hybrid and Swiss pair entries, not positions: a swap only exchanges who plays those matches.
}

export async function publishDraws(
  actor: Actor,
  eventId: string,
  publish: boolean,
  meta: RequestMeta,
) {
  const event = await loadEvent(eventId);
  await assertCanManageTournament(actor, event.tournamentId);
  const draws = await prisma.draw.findMany({
    where: { eventId },
    select: { id: true, status: true },
  });
  if (draws.length === 0) throw new AppError('notFound');
  if (publish && new Date() < event.tournament.registrationClosesAt)
    throw new AppError('entriesStillOpen');
  if (!publish) {
    const played = await prisma.match.count({
      where: {
        draw: { eventId },
        status: { in: ['IN_PROGRESS', 'COMPLETED', 'WALKOVER', 'RETIRED'] },
      },
    });
    if (played > 0) throw new AppError('drawStarted');
  }
  await prisma.$transaction(async (tx) => {
    await tx.draw.updateMany({
      where: { eventId },
      data: publish
        ? { status: 'PUBLISHED', publishedAt: new Date() }
        : { status: 'DRAFT', publishedAt: null },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: publish ? 'draw.publish' : 'draw.unpublish',
      entityType: 'TournamentEvent',
      entityId: eventId,
      meta,
    });
  });
}

export async function deleteDraft(actor: Actor, eventId: string, meta: RequestMeta) {
  const event = await loadEvent(eventId);
  await assertCanManageTournament(actor, event.tournamentId);
  await assertDraft(eventId);
  await prisma.$transaction(async (tx) => {
    await tx.draw.deleteMany({ where: { eventId } });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'draw.delete',
      entityType: 'TournamentEvent',
      entityId: eventId,
      meta,
    });
  });
}

/** Organiser overview: per event its number of entries and draw status. */
export async function drawOverview(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const events = await prisma.tournamentEvent.findMany({
    where: { tournamentId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      discipline: true,
      name: true,
      drawType: true,
      ageCategory: { select: { code: true, name: true } },
      levelClass: { select: { code: true } },
      _count: { select: { registrations: { where: { status: 'CONFIRMED' } } } },
      draws: { select: { status: true } },
    },
  });
  return events.map((e) => ({
    id: e.id,
    label: eventText(e, actor.locale),
    drawType: e.drawType,
    entries: e._count.registrations,
    status:
      e.draws.length === 0
        ? 'NONE'
        : e.draws.some((d) => d.status !== 'DRAFT')
          ? 'PUBLISHED'
          : 'DRAFT',
  }));
}

/** Public: published draws of a tournament, per event. */
export async function publicDraws(slug: string) {
  const tournament = await prisma.tournament.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    select: { id: true },
  });
  if (!tournament) throw new AppError('notFound');
  const events = await prisma.tournamentEvent.findMany({
    where: {
      tournamentId: tournament.id,
      deletedAt: null,
      draws: { some: { status: { not: 'DRAFT' } } },
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      discipline: true,
      name: true,
      drawType: true,
      ageCategory: { select: { code: true, name: true } },
      levelClass: { select: { code: true } },
    },
  });
  return Promise.all(events.map(async (e) => ({ event: e, draws: await eventDraws(e.id, true) })));
}

/** Display name of a draw entry: "Anna de Vries / Bram Jansen", or null for a bye. */
export function entryName(entry: EventDraw['entries'][number] | undefined): string | null {
  if (!entry?.registration) return null;
  return entry.registration.participants.map((p) => fullName(p.player)).join(' / ');
}

/** Whether a tournament has any published draw (for the "Draws" link). */
export async function hasPublishedDraws(tournamentSlug: string) {
  return (
    (await prisma.draw.count({
      where: {
        status: { not: 'DRAFT' },
        event: { deletedAt: null, tournament: { slug: tournamentSlug } },
      },
    })) > 0
  );
}
