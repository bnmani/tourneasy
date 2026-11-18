/**
 * Expected knockout rounds (D121). A category with a group stage (hybrid or groups + knockout)
 * only gets its knockout matches once the groups are done, because who qualifies decides the
 * pairings. Until then the schedule would stop at the group matches, so this works out when the
 * knockout rounds would be played: the same planner places them after the category's last
 * group match, on the courts that are left, with the same match lengths and rest. Nothing is
 * stored; the rows disappear when the real knockout is made and scheduled.
 */
import { prisma } from '@tourneasy/db';
import {
  bracketOrder,
  defaultRestMinutes,
  knockoutPlan,
  nextPowerOfTwo,
  proposeSchedule,
  rulesForMatch,
  slotMinutes,
  type FixedSlot,
  type ScheduleMatch,
} from '@tourneasy/shared';
import { messages } from '@tourneasy/shared/i18n';
import { writeAudit } from '../lib/audit';
import type { RequestMeta } from '../lib/request-meta';
import { assertCanManageTournament } from './permissions';
import { eventText } from './registration-service';
import { knockoutRoundName, scheduleDays } from './schedule-service';
import type { Actor } from './session-service';

/** SiteSetting key: the tournaments that switched the expected rounds off (ids). */
export const EXPECTED_KNOCKOUT_OFF_KEY = 'schedule.expectedKnockoutOff';

async function offList(): Promise<string[]> {
  const row = await prisma.siteSetting.findUnique({ where: { key: EXPECTED_KNOCKOUT_OFF_KEY } });
  return Array.isArray(row?.value) ? (row.value as string[]) : [];
}

export async function isExpectedKnockoutOn(tournamentId: string) {
  return !(await offList()).includes(tournamentId);
}

/** Organisers and admins: show or hide the expected knockout rounds of one tournament. */
export async function setExpectedKnockout(
  actor: Actor,
  tournamentId: string,
  on: boolean,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const list = (await offList()).filter((id) => id !== tournamentId);
  const next = on ? list : [...list, tournamentId];
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: EXPECTED_KNOCKOUT_OFF_KEY },
      create: { key: EXPECTED_KNOCKOUT_OFF_KEY, value: next },
      update: { value: next },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'schedule.expectedKnockout',
      entityType: 'Tournament',
      entityId: tournamentId,
      after: { on },
      meta,
    });
  });
}

export type ExpectedRound = {
  /** "Quarter-final", "Semi-final", "Final", "Round of 16" … */
  name: string;
  /** First start and last end of the round (UTC). */
  from: Date;
  until: Date;
  /** One line per match: "1st vs 8th"; later rounds: one line, "Winners of the round before" (b is null). */
  matches: { a: string; b: string | null }[];
};

export type ExpectedCategory = {
  eventId: string;
  /** The category's name in the reader's language. */
  event: string;
  rounds: ExpectedRound[];
};

type Locale = 'nl' | 'en';

/** "1st", "2nd", "3rd", "4th" (NL: "1e", "2e"): the place in the group-stage ranking. */
function rankLabel(n: number, locale: Locale) {
  if (locale === 'nl') return `${n}e`;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * The expected knockout rounds of a tournament, per category that has no knockout yet. Empty
 * when the switch is off, there is nothing to expect, or a group match has no court and time
 * yet (nothing to place the knockout after).
 */
export async function expectedKnockout(
  tournamentId: string,
  locale: Locale,
  now = new Date(),
): Promise<ExpectedCategory[]> {
  if (!(await isExpectedKnockoutOn(tournamentId))) return [];
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: {
      startsOn: true,
      endsOn: true,
      dayStartTime: true,
      dayEndTime: true,
      matchMinutes: true,
      singleGameMinutes: true,
      restMinutes: true,
      courtsAvailable: true,
      venue: { select: { id: true, numberOfCourts: true } },
    },
  });
  if (!t?.venue) return [];
  const events = await prisma.tournamentEvent.findMany({
    where: {
      tournamentId,
      deletedAt: null,
      drawType: { in: ['HYBRID_ROUND_ROBIN_KNOCKOUT', 'GROUPS_KNOCKOUT'] },
      draws: { some: { status: { not: 'DRAFT' } } },
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      sortOrder: true,
      discipline: true,
      name: true,
      drawType: true,
      knockoutSize: true,
      advancePerGroup: true,
      restMinutes: true,
      bestOf: true,
      pointsToWin: true,
      pointsCap: true,
      koScoringFrom: true,
      koBestOf: true,
      koPointsToWin: true,
      koPointsCap: true,
      ageCategory: { select: { code: true, name: true } },
      levelClass: { select: { code: true } },
      draws: {
        where: { status: { not: 'DRAFT' } },
        select: {
          stage: true,
          entries: { select: { registrationId: true } },
        },
      },
    },
  });
  const candidates = events.filter((e) => !e.draws.some((d) => d.stage === 'KNOCKOUT'));
  if (candidates.length === 0) return [];

  const matches = await prisma.match.findMany({
    where: {
      draw: { status: { not: 'DRAFT' }, event: { tournamentId, deletedAt: null } },
      status: { notIn: ['BYE', 'CANCELLED'] },
    },
    select: {
      id: true,
      draw: { select: { eventId: true } },
      slot: { select: { courtId: true, startsAt: true, endsAt: true } },
      entryA: {
        select: {
          registration: { select: { participants: { select: { playerId: true, active: true } } } },
        },
      },
      entryB: {
        select: {
          registration: { select: { participants: { select: { playerId: true, active: true } } } },
        },
      },
    },
  });
  const playersOf = (m: (typeof matches)[number]) =>
    [m.entryA, m.entryB].flatMap(
      (e) => e?.registration?.participants.filter((p) => p.active).map((p) => p.playerId) ?? [],
    );
  const fixed: FixedSlot[] = matches
    .filter((m) => m.slot)
    .map((m) => ({
      matchId: m.id,
      court: m.slot!.courtId,
      start: m.slot!.startsAt,
      end: m.slot!.endsAt,
      players: playersOf(m),
    }));

  const count = t.courtsAvailable ?? t.venue.numberOfCourts;
  const courts = await prisma.court.findMany({
    where: { venueId: t.venue.id, number: { lte: count } },
    orderBy: { number: 'asc' },
    select: { id: true },
  });
  if (courts.length === 0) return [];

  const virtual: ScheduleMatch[] = [];
  const shapes = new Map<
    string,
    {
      event: (typeof candidates)[number];
      size: number;
      plan: ReturnType<typeof knockoutPlan>;
      /** First round: the bracket ranks of both sides, per match (in plan order). */
      ranks: number[][];
      rounds: number;
      seeds: number;
      groupStage: boolean;
    }
  >();
  for (const e of candidates) {
    const groupMatches = matches.filter((m) => m.draw.eventId === e.id);
    // Every group match needs its court and time: the knockout is placed after the last one.
    if (groupMatches.length === 0 || groupMatches.some((m) => !m.slot)) continue;
    const entered = e.draws.flatMap((d) => d.entries).filter((x) => x.registrationId).length;
    let size: number;
    let qualifiers: number;
    let seeds: number;
    if (e.drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT') {
      if (entered < 2) continue;
      // The same count the real knockout takes; every qualifier goes to its ranked place (D123).
      qualifiers = Math.min(e.knockoutSize ?? 16, 2 ** Math.floor(Math.log2(Math.max(2, entered))));
      size = nextPowerOfTwo(qualifiers);
      seeds = qualifiers;
    } else {
      const groups = e.draws.filter((d) => d.stage === 'GROUP');
      const per = e.advancePerGroup ?? 2;
      qualifiers = groups.reduce(
        (n, d) => n + Math.min(per, d.entries.filter((x) => x.registrationId).length),
        0,
      );
      if (qualifiers < 2) continue;
      size = nextPowerOfTwo(qualifiers);
      seeds = groups.length;
    }
    const plan = knockoutPlan(size);
    const order = bracketOrder(size);
    const rounds = Math.log2(size);
    // First round: the bracket ranks of both sides. A rank above the qualifiers is a bye, so
    // that match is never played.
    const ranks = plan.map((p) => (p.round === 1 ? [order[p.a! - 1]!, order[p.b! - 1]!] : []));
    const real = new Set(
      plan
        .filter((p, i) => p.round > 1 || ranks[i]!.every((r) => r <= qualifiers))
        .map((p) => p.number),
    );
    const restMinutes = e.restMinutes ?? defaultRestMinutes(e.drawType, t.restMinutes);
    const groupIds = groupMatches.map((m) => m.id);
    for (const p of plan) {
      if (!real.has(p.number)) continue;
      const bestOf = rulesForMatch(e, {
        stage: 'KNOCKOUT',
        type: 'KNOCKOUT',
        size,
        round: p.round,
        bracket: 'W',
      }).bestOf;
      virtual.push({
        id: `ko:${e.id}:${p.number}`,
        eventOrder: e.sortOrder,
        bracket: 'W',
        round: p.round,
        number: p.number,
        players: [],
        // The first round waits for the whole group stage; later rounds for their feeders.
        feeders:
          p.round === 1
            ? groupIds
            : plan
                .filter((f) => f.next?.match === p.number && real.has(f.number))
                .map((f) => `ko:${e.id}:${f.number}`),
        restMinutes,
        minutes: slotMinutes(bestOf, t),
      });
    }
    shapes.set(e.id, {
      event: e,
      size,
      plan,
      ranks,
      rounds,
      seeds,
      groupStage: e.drawType !== 'HYBRID_ROUND_ROBIN_KNOCKOUT',
    });
  }
  if (virtual.length === 0) return [];

  // Never earlier than now: a group stage that runs late pushes the estimate with it.
  const floor = process.env.NODE_ENV === 'test' ? 0 : Math.ceil(now.getTime() / 300_000) * 300_000;
  const days = scheduleDays(t)
    .map((d) => ({ ...d, start: new Date(Math.max(d.start.getTime(), floor)) }))
    .filter(
      (d) =>
        d.end.getTime() - d.start.getTime() >=
        Math.min(t.matchMinutes, t.singleGameMinutes) * 60_000,
    );
  const result = proposeSchedule({
    matches: virtual,
    courts: courts.map((c) => c.id),
    days,
    fixed,
  });
  const slotOf = new Map(result.slots.map((s) => [s.matchId, s]));

  const text = messages[locale].Draws as Record<string, string>;
  const fill = (key: string, params: Record<string, string | number> = {}) =>
    Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text[key]!);
  const winners = messages[locale].Matches.expectedWinners as string;
  const out: ExpectedCategory[] = [];
  for (const [eventId, shape] of shapes) {
    const { seeds } = shape;
    const rounds: ExpectedRound[] = [];
    for (let round = 1; round <= shape.rounds; round++) {
      const inRound = shape.plan.filter((p) => p.round === round);
      const planned = inRound
        .map((p) => ({ p, slot: slotOf.get(`ko:${eventId}:${p.number}`) }))
        .filter((x) => x.slot);
      // Rounds that could not be placed (the days run out) are left out rather than guessed.
      if (planned.length === 0) break;
      const side = (rank: number) => {
        if (shape.groupStage)
          return rank <= seeds
            ? (messages[locale].Matches.expectedGroupWinner as string)
            : (messages[locale].Matches.expectedRunnerUp as string);
        return rankLabel(rank, locale);
      };
      rounds.push({
        name: knockoutRoundName(shape.rounds - round, round, fill),
        from: new Date(Math.min(...planned.map((x) => x.slot!.start.getTime()))),
        until: new Date(Math.max(...planned.map((x) => x.slot!.end.getTime()))),
        // Later rounds depend on the results: one line instead of "winner vs winner" per match.
        matches:
          round > 1
            ? [{ a: winners, b: null }]
            : planned.map(({ p }) => {
                const [a, b] = shape.ranks[shape.plan.indexOf(p)]!;
                return { a: side(a!), b: side(b!) };
              }),
      });
    }
    if (rounds.length > 0)
      out.push({
        eventId,
        event: eventText(shape.event, locale),
        rounds,
      });
  }
  return out;
}

/**
 * For My schedule: the expected knockout rounds of the categories these players are entered
 * in, in tournaments with a published schedule.
 */
export async function expectedKnockoutOfPlayers(playerIds: string[], locale: Locale) {
  if (playerIds.length === 0) return [];
  const rows = await prisma.tournamentEvent.findMany({
    where: {
      deletedAt: null,
      tournament: { isPublished: true, deletedAt: null, schedulePublishedAt: { not: null } },
      registrations: {
        some: {
          status: { in: ['CONFIRMED', 'PENDING'] },
          participants: { some: { playerId: { in: playerIds }, active: true } },
        },
      },
    },
    select: { id: true, tournament: { select: { id: true, name: true, slug: true } } },
  });
  const byTournament = new Map<string, { name: string; slug: string; events: Set<string> }>();
  for (const r of rows) {
    const entry = byTournament.get(r.tournament.id) ?? {
      name: r.tournament.name,
      slug: r.tournament.slug,
      events: new Set<string>(),
    };
    entry.events.add(r.id);
    byTournament.set(r.tournament.id, entry);
  }
  const out: { tournament: { name: string; slug: string }; categories: ExpectedCategory[] }[] = [];
  for (const [id, t] of byTournament) {
    const categories = (await expectedKnockout(id, locale)).filter((c) => t.events.has(c.eventId));
    if (categories.length > 0) out.push({ tournament: { name: t.name, slug: t.slug }, categories });
  }
  return out;
}

/** My schedule: the expected knockout rounds of the categories I am entered in. */
export async function myExpectedKnockout(actor: Actor, locale: Locale) {
  const player = await prisma.playerProfile.findFirst({
    where: { userId: actor.userId, deletedAt: null },
    select: { id: true },
  });
  return player ? expectedKnockoutOfPlayers([player.id], locale) : [];
}

/** Public: the expected knockout rounds of a published tournament with a published schedule. */
export async function publicExpectedKnockout(slug: string, locale: Locale) {
  const t = await prisma.tournament.findFirst({
    where: { slug, isPublished: true, deletedAt: null, schedulePublishedAt: { not: null } },
    select: { id: true },
  });
  return t ? expectedKnockout(t.id, locale) : [];
}
