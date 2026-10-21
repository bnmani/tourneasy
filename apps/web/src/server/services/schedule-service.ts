/**
 * Schedule (Phase 6b, D56): proposed automatically over the tournament's courts and days,
 * adjusted by hand (move, swap, take off), then published. Changes after publishing are
 * marked so players notice them. The database refuses two matches on one court at once.
 */
import { prisma, type Prisma } from '@tourneasy/db';
import {
  amsterdamLocalToUtc,
  defaultRestMinutes,
  proposeSchedule,
  restConflicts,
  type FixedSlot,
  type ScheduleMatch,
} from '@tourneasy/shared';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { assertCanManageTournament } from './permissions';
import { eventText, fullName } from './registration-service';
import type { Actor } from './session-service';

type Tx = Prisma.TransactionClient;

const entrySelect = {
  id: true,
  registrationId: true,
  seed: true,
  registration: {
    select: {
      participants: {
        where: { active: true },
        orderBy: { role: 'asc' },
        select: {
          id: true,
          checkedInAt: true,
          player: {
            select: {
              id: true,
              memberNumber: true,
              firstName: true,
              lastNamePrefix: true,
              lastName: true,
              club: { select: { name: true, shortName: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DrawEntrySelect;

export const matchSelect = {
  id: true,
  matchNumber: true,
  round: true,
  bracket: true,
  status: true,
  version: true,
  nextMatchId: true,
  nextMatchSlot: true,
  loserNextMatchId: true,
  loserNextMatchSlot: true,
  winnerEntryId: true,
  startedAt: true,
  completedAt: true,
  entryA: { select: entrySelect },
  entryB: { select: entrySelect },
  sets: { orderBy: { setNumber: 'asc' }, select: { setNumber: true, scoreA: true, scoreB: true } },
  slot: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      updatedAt: true,
      court: { select: { id: true, number: true, name: true } },
    },
  },
  draw: {
    select: {
      id: true,
      type: true,
      stage: true,
      name: true,
      status: true,
      size: true,
      event: {
        select: {
          id: true,
          sortOrder: true,
          discipline: true,
          name: true,
          drawType: true,
          restMinutes: true,
          bestOf: true,
          pointsToWin: true,
          pointsCap: true,
          ageCategory: { select: { code: true, name: true } },
          levelClass: { select: { code: true } },
          tournamentId: true,
        },
      },
    },
  },
} satisfies Prisma.MatchSelect;
export type MatchRow = Prisma.MatchGetPayload<{ select: typeof matchSelect }>;

export const sideName = (entry: MatchRow['entryA']) =>
  entry?.registration
    ? entry.registration.participants.map((p) => fullName(p.player)).join(' / ')
    : null;
export const sidePlayers = (entry: MatchRow['entryA']) =>
  entry?.registration?.participants.map((p) => p.player.id) ?? [];

async function loadTournament(tournamentId: string) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      startsOn: true,
      endsOn: true,
      dayStartTime: true,
      dayEndTime: true,
      matchMinutes: true,
      restMinutes: true,
      courtsAvailable: true,
      schedulePublishedAt: true,
      venue: { select: { id: true, numberOfCourts: true } },
    },
  });
  if (!t) throw new AppError('notFound');
  return t;
}
type TournamentRow = Awaited<ReturnType<typeof loadTournament>>;

/** The tournament's courts (created for the venue on first use). */
async function ensureCourts(tx: Tx | typeof prisma, t: TournamentRow) {
  if (!t.venue) throw new AppError('noVenue');
  const count = t.courtsAvailable ?? t.venue.numberOfCourts;
  for (let n = 1; n <= count; n++) {
    await tx.court.upsert({
      where: { venueId_number: { venueId: t.venue.id, number: n } },
      create: { venueId: t.venue.id, number: n },
      update: {},
    });
  }
  return tx.court.findMany({
    where: { venueId: t.venue.id, number: { lte: count } },
    orderBy: { number: 'asc' },
    select: { id: true, number: true, name: true },
  });
}

/** Playing days in UTC: each tournament day from the start time to the end time (Dutch time). */
export function scheduleDays(
  t: Pick<TournamentRow, 'startsOn' | 'endsOn' | 'dayStartTime' | 'dayEndTime'>,
) {
  const days = [];
  for (let d = new Date(t.startsOn); d <= t.endsOn; d = new Date(d.getTime() + 86_400_000)) {
    const date = d.toISOString().slice(0, 10);
    days.push({
      date,
      start: amsterdamLocalToUtc(`${date}T${t.dayStartTime ?? '09:00'}`)!,
      end: amsterdamLocalToUtc(`${date}T${t.dayEndTime ?? '22:00'}`)!,
    });
  }
  return days;
}

/** All matches of published draws that need a court (byes and cancelled ones don't). */
export async function tournamentMatches(tournamentId: string) {
  return prisma.match.findMany({
    where: {
      draw: { status: { not: 'DRAFT' }, event: { tournamentId, deletedAt: null } },
      status: { notIn: ['BYE', 'CANCELLED'] },
    },
    orderBy: [{ slot: { startsAt: 'asc' } }, { matchNumber: 'asc' }],
    select: matchSelect,
  });
}

function feedersOf(
  matches: { id: string; nextMatchId: string | null; loserNextMatchId: string | null }[],
) {
  const feeders = new Map<string, string[]>();
  for (const m of matches) {
    for (const target of [m.nextMatchId, m.loserNextMatchId]) {
      if (target) feeders.set(target, [...(feeders.get(target) ?? []), m.id]);
    }
  }
  return feeders;
}

const restFor = (m: MatchRow, tournamentRest: number) =>
  m.draw.event.restMinutes ?? defaultRestMinutes(m.draw.event.drawType, tournamentRest);

const proposeSchema = z.object({ mode: z.enum(['all', 'remaining']).default('all') });

/**
 * Proposes the schedule. "all" re-plans every match that hasn't started; "remaining" keeps the
 * current slots and only plans matches without one (e.g. a knockout made after the groups).
 */
export async function proposeTournamentSchedule(
  actor: Actor,
  tournamentId: string,
  input: unknown,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const { mode } = parseInput(proposeSchema, input ?? {});
  const t = await loadTournament(tournamentId);
  const courts = await ensureCourts(prisma, t);
  const matches = await tournamentMatches(tournamentId);
  if (matches.length === 0) throw new AppError('noPublishedDraws');
  const allMatches = await prisma.match.findMany({
    where: { draw: { event: { tournamentId } } },
    select: { id: true, nextMatchId: true, loserNextMatchId: true },
  });
  const feeders = feedersOf(allMatches);
  // Byes and walkovers never get a court: treat matches without a slot need as already done.
  const scheduledIds = new Set(matches.map((m) => m.id));
  const keep = (m: MatchRow) => m.slot && (m.status !== 'SCHEDULED' || mode === 'remaining');
  const fixed: FixedSlot[] = matches.filter(keep).map((m) => ({
    matchId: m.id,
    court: m.slot!.court.id,
    start: m.slot!.startsAt,
    end: m.slot!.endsAt,
    players: [...sidePlayers(m.entryA), ...sidePlayers(m.entryB)],
  }));
  // Finished matches without a court (e.g. a walkover) count as done for their followers.
  const doneWithoutSlot = matches.filter(
    (m) => !m.slot && m.status !== 'SCHEDULED' && m.status !== 'CALLED',
  );
  const plan = matches
    .filter((m) => !keep(m) && !doneWithoutSlot.includes(m))
    .map((m): ScheduleMatch => ({
      id: m.id,
      eventOrder: m.draw.event.sortOrder,
      bracket: m.bracket as 'W' | 'L' | 'F',
      round: m.round,
      number: m.matchNumber,
      players: [...sidePlayers(m.entryA), ...sidePlayers(m.entryB)],
      // Feeders that are byes (no court) are already decided.
      feeders: (feeders.get(m.id) ?? []).filter(
        (f) => scheduledIds.has(f) && !doneWithoutSlot.some((d) => d.id === f),
      ),
      restMinutes: restFor(m, t.restMinutes),
    }));
  const now = Date.now();
  const days = scheduleDays(t).filter(
    (d) => d.end.getTime() > now || process.env.NODE_ENV === 'test',
  );
  const result = proposeSchedule({
    matches: plan,
    courts: courts.map((c) => c.id),
    days,
    matchMinutes: t.matchMinutes,
    fixed,
  });
  await prisma.$transaction(
    async (tx) => {
      await tx.courtSlot.deleteMany({
        where: { tournamentId, matchId: { in: plan.map((p) => p.id) } },
      });
      await tx.courtSlot.createMany({
        data: result.slots.map((s) => ({
          tournamentId,
          courtId: s.court,
          matchId: s.matchId,
          startsAt: s.start,
          endsAt: s.end,
          isPublished: !!t.schedulePublishedAt,
        })),
      });
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'schedule.propose',
        entityType: 'Tournament',
        entityId: tournamentId,
        after: { mode, scheduled: result.slots.length, unscheduled: result.unscheduled.length },
        meta,
      });
    },
    { timeout: 60_000 },
  );
  return { scheduled: result.slots.length, unscheduled: result.unscheduled.length };
}

const moveSchema = z.object({
  courtId: z.string().uuid(),
  /** "2027-03-13T10:30", Dutch time. */
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'invalid'),
});

async function matchTournament(matchId: string) {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      draw: { select: { event: { select: { tournamentId: true } } } },
    },
  });
  if (!m) throw new AppError('notFound');
  return { ...m, tournamentId: m.draw.event.tournamentId };
}

/** Puts a match on a court at a time (by hand). Refused when the court is taken then. */
export async function moveMatch(actor: Actor, matchId: string, input: unknown, meta: RequestMeta) {
  const m = await matchTournament(matchId);
  await assertCanManageTournament(actor, m.tournamentId);
  const { courtId, startsAt } = parseInput(moveSchema, input);
  const t = await loadTournament(m.tournamentId);
  const courts = await ensureCourts(prisma, t);
  if (!courts.some((c) => c.id === courtId))
    throw new AppError('validation', { fields: { courtId: 'invalid' } });
  const start = amsterdamLocalToUtc(startsAt);
  if (!start) throw new AppError('validation', { fields: { startsAt: 'invalid' } });
  const end = new Date(start.getTime() + t.matchMinutes * 60_000);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.courtSlot.deleteMany({ where: { matchId } });
      await tx.courtSlot.create({
        data: {
          tournamentId: t.id,
          courtId,
          matchId,
          startsAt: start,
          endsAt: end,
          isPublished: !!t.schedulePublishedAt,
        },
      });
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'schedule.move',
        entityType: 'Match',
        entityId: matchId,
        after: { courtId, startsAt: start.toISOString() },
        meta,
      });
    });
  } catch (error) {
    if (String(error).includes('court_slot_no_overlap')) throw new AppError('courtTaken');
    throw error;
  }
}

/** Exchanges the court and time of two matches. */
export async function swapMatches(actor: Actor, input: unknown, meta: RequestMeta) {
  const { a, b } = parseInput(z.object({ a: z.string().uuid(), b: z.string().uuid() }), input);
  const [ma, mb] = await Promise.all([matchTournament(a), matchTournament(b)]);
  if (ma.tournamentId !== mb.tournamentId)
    throw new AppError('validation', { fields: { b: 'invalid' } });
  await assertCanManageTournament(actor, ma.tournamentId);
  const slots = await prisma.courtSlot.findMany({ where: { matchId: { in: [a, b] } } });
  const sa = slots.find((s) => s.matchId === a);
  const sb = slots.find((s) => s.matchId === b);
  if (!sa || !sb) throw new AppError('notScheduled');
  await prisma.$transaction(async (tx) => {
    // Free both, then re-create crosswise (keeps the overlap constraint happy).
    await tx.courtSlot.deleteMany({ where: { id: { in: [sa.id, sb.id] } } });
    await tx.courtSlot.create({
      data: {
        tournamentId: sa.tournamentId,
        courtId: sb.courtId,
        matchId: a,
        startsAt: sb.startsAt,
        endsAt: sb.endsAt,
        isPublished: sa.isPublished,
      },
    });
    await tx.courtSlot.create({
      data: {
        tournamentId: sa.tournamentId,
        courtId: sa.courtId,
        matchId: b,
        startsAt: sa.startsAt,
        endsAt: sa.endsAt,
        isPublished: sb.isPublished,
      },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'schedule.swap',
      entityType: 'Match',
      entityId: a,
      after: { with: b },
      meta,
    });
  });
}

export async function unscheduleMatch(actor: Actor, matchId: string, meta: RequestMeta) {
  const m = await matchTournament(matchId);
  await assertCanManageTournament(actor, m.tournamentId);
  if (m.status !== 'SCHEDULED') throw new AppError('drawStarted');
  await prisma.$transaction(async (tx) => {
    await tx.courtSlot.deleteMany({ where: { matchId } });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'schedule.remove',
      entityType: 'Match',
      entityId: matchId,
      meta,
    });
  });
}

export async function publishSchedule(
  actor: Actor,
  tournamentId: string,
  publish: boolean,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  await prisma.$transaction(async (tx) => {
    await tx.courtSlot.updateMany({ where: { tournamentId }, data: { isPublished: publish } });
    // Stamped after the slots, so only later changes count as "changed".
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { schedulePublishedAt: publish ? new Date() : null },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: publish ? 'schedule.publish' : 'schedule.unpublish',
      entityType: 'Tournament',
      entityId: tournamentId,
      meta,
    });
  });
}

/** Round name for lists: "Finale", "Halve finale", "Poule A · ronde 2", "Herkansing ronde 3". */
export function roundLabel(m: MatchRow, locale: 'nl' | 'en') {
  const nl = locale === 'nl';
  if (m.bracket === 'F') return nl ? 'Finale' : 'Final';
  if (m.bracket === 'L') return nl ? `Herkansing ronde ${m.round}` : `Losers round ${m.round}`;
  if (m.draw.type === 'KNOCKOUT' || m.draw.stage === 'KNOCKOUT') {
    const left = Math.log2(m.draw.size) - m.round;
    if (left === 0) return nl ? 'Finale' : 'Final';
    if (left === 1) return nl ? 'Halve finale' : 'Semi-final';
    if (left === 2) return nl ? 'Kwartfinale' : 'Quarter-final';
  }
  const group = m.draw.name ? `${nl ? 'Poule' : 'Group'} ${m.draw.name} · ` : '';
  return `${group}${nl ? 'ronde' : 'round'} ${m.round}`;
}

export type ScheduleItem = ReturnType<typeof toItem>;

function toItem(
  m: MatchRow,
  locale: 'nl' | 'en',
  publishedAt: Date | null,
  feederNumbers: Map<string, number[]>,
) {
  const placeholder = (slot: 'A' | 'B') => {
    const from = feederNumbers.get(`${m.id}${slot}`);
    return from
      ? locale === 'nl'
        ? `Winnaar #${from.join('/')}`
        : `Winner #${from.join('/')}`
      : null;
  };
  return {
    id: m.id,
    number: m.matchNumber,
    status: m.status,
    event: eventText(m.draw.event, locale),
    eventId: m.draw.event.id,
    round: roundLabel(m, locale),
    a: sideName(m.entryA) ?? placeholder('A'),
    b: sideName(m.entryB) ?? placeholder('B'),
    aEntryId: m.entryA?.id ?? null,
    bEntryId: m.entryB?.id ?? null,
    winnerEntryId: m.winnerEntryId,
    sets: m.sets,
    players: [...sidePlayers(m.entryA), ...sidePlayers(m.entryB)],
    court: m.slot?.court ?? null,
    startsAt: m.slot?.startsAt ?? null,
    endsAt: m.slot?.endsAt ?? null,
    changed: !!publishedAt && !!m.slot && m.slot.updatedAt > publishedAt,
    checkIn: [m.entryA, m.entryB].map(
      (e) =>
        e?.registration?.participants.map((p) => ({
          id: p.id,
          name: fullName(p.player),
          checkedIn: !!p.checkedInAt,
        })) ?? [],
    ),
  };
}

async function feederNumbers(tournamentId: string) {
  const rows = await prisma.match.findMany({
    where: { draw: { event: { tournamentId } } },
    select: {
      matchNumber: true,
      nextMatchId: true,
      nextMatchSlot: true,
      loserNextMatchId: true,
      loserNextMatchSlot: true,
    },
  });
  const map = new Map<string, number[]>();
  for (const r of rows) {
    if (r.nextMatchId) map.set(`${r.nextMatchId}${r.nextMatchSlot}`, [r.matchNumber]);
    if (r.loserNextMatchId)
      map.set(`${r.loserNextMatchId}${r.loserNextMatchSlot}`, [r.matchNumber]);
  }
  return map;
}

/** Organiser view: days with courts and matches, unscheduled matches and rest warnings. */
export async function getSchedule(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const t = await loadTournament(tournamentId);
  const courts = t.venue ? await ensureCourts(prisma, t) : [];
  const [matches, feeders] = await Promise.all([
    tournamentMatches(tournamentId),
    feederNumbers(tournamentId),
  ]);
  const items = matches.map((m) => toItem(m, actor.locale, t.schedulePublishedAt, feeders));
  const restOf = new Map(matches.map((m) => [m.id, restFor(m, t.restMinutes)]));
  const conflicts = restConflicts(
    items
      .filter((i) => i.startsAt)
      .map((i) => ({
        matchId: i.id,
        start: i.startsAt!,
        end: i.endsAt!,
        players: i.players,
        restMinutes: restOf.get(i.id)!,
      })),
  );
  return {
    tournament: t,
    courts,
    days: scheduleDays(t),
    scheduled: items.filter((i) => i.startsAt),
    unscheduled: items.filter(
      (i) => !i.startsAt && (i.status === 'SCHEDULED' || i.status === 'CALLED'),
    ),
    conflictIds: new Set(conflicts.map((c) => c.matchId)),
  };
}

/** Public: the published schedule of a tournament. */
export async function publicSchedule(slug: string, locale: 'nl' | 'en') {
  const t = await prisma.tournament.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    select: { id: true, schedulePublishedAt: true },
  });
  if (!t) throw new AppError('notFound');
  if (!t.schedulePublishedAt) return { published: false as const, items: [] };
  const [matches, feeders] = await Promise.all([tournamentMatches(t.id), feederNumbers(t.id)]);
  return {
    published: true as const,
    items: matches
      .filter((m) => m.slot)
      .map((m) => toItem(m, locale, t.schedulePublishedAt, feeders)),
  };
}

/** My matches (published schedules only), upcoming first, then played ones. */
export async function myMatches(actor: Actor) {
  const player = await prisma.playerProfile.findFirst({
    where: { userId: actor.userId, deletedAt: null },
    select: { id: true },
  });
  if (!player) return [];
  const mine = { registration: { participants: { some: { playerId: player.id, active: true } } } };
  const matches = await prisma.match.findMany({
    where: {
      draw: {
        status: { not: 'DRAFT' },
        event: { tournament: { schedulePublishedAt: { not: null } } },
      },
      status: { notIn: ['BYE', 'CANCELLED'] },
      OR: [{ entryA: mine }, { entryB: mine }],
    },
    orderBy: [{ slot: { startsAt: 'asc' } }],
    select: {
      ...matchSelect,
      draw: {
        select: {
          ...matchSelect.draw.select,
          event: {
            select: {
              ...matchSelect.draw.select.event.select,
              tournament: { select: { name: true, slug: true, schedulePublishedAt: true } },
            },
          },
        },
      },
    },
  });
  return matches.map((m) => ({
    ...toItem(
      m as unknown as MatchRow,
      actor.locale,
      m.draw.event.tournament.schedulePublishedAt,
      new Map(),
    ),
    tournament: m.draw.event.tournament,
  }));
}

/** Desk view: every match of the published draws with what the desk needs, per filter. */
export async function deskMatches(
  actor: Actor,
  tournamentId: string,
  view: 'now' | 'next' | 'open' | 'done',
) {
  await assertCanManageTournament(actor, tournamentId);
  const t = await loadTournament(tournamentId);
  const [matches, feeders] = await Promise.all([
    tournamentMatches(tournamentId),
    feederNumbers(tournamentId),
  ]);
  const items = matches.map((m) => ({
    ...toItem(m, actor.locale, t.schedulePublishedAt, feeders),
    version: m.version,
    bestOf: m.draw.event.bestOf,
    ready: !!m.entryA?.registration && !!m.entryB?.registration,
  }));
  const done = (s: string) => s === 'COMPLETED' || s === 'WALKOVER' || s === 'RETIRED';
  const filtered =
    view === 'now'
      ? items.filter((i) => i.status === 'IN_PROGRESS' || i.status === 'CALLED')
      : view === 'next'
        ? items.filter((i) => i.status === 'SCHEDULED' && i.ready).slice(0, 30)
        : view === 'open'
          ? items.filter((i) => !done(i.status))
          : items.filter((i) => done(i.status)).reverse();
  return { tournament: t, items: filtered };
}

/**
 * Live block (D57): matches on court now and the next ones, for tournaments with a published
 * schedule that play today (one tournament by slug, or all for the home page).
 */
export async function liveMatches(locale: 'nl' | 'en', slug?: string, now = new Date()) {
  const today = new Date(now.toISOString().slice(0, 10));
  const tournaments = await prisma.tournament.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      schedulePublishedAt: { not: null },
      startsOn: { lte: today },
      endsOn: { gte: today },
      ...(slug ? { slug } : {}),
    },
    select: { id: true, name: true, slug: true, schedulePublishedAt: true },
    take: 5,
  });
  const out = [];
  for (const t of tournaments) {
    const [matches, feeders] = await Promise.all([tournamentMatches(t.id), feederNumbers(t.id)]);
    const items = matches.map((m) => toItem(m, locale, t.schedulePublishedAt, feeders));
    const onCourt = items.filter((i) => i.status === 'IN_PROGRESS' || i.status === 'CALLED');
    const next = items
      .filter((i) => i.status === 'SCHEDULED' && i.startsAt && i.endsAt! > now)
      .slice(0, 6);
    if (onCourt.length || next.length) out.push({ tournament: t, onCourt, next });
  }
  return out;
}
