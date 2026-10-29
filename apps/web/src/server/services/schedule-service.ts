/**
 * Schedule (Phase 6b, D56): proposed automatically over the tournament's courts and days,
 * adjusted by hand (move, swap, take off), then published. Changes after publishing are
 * marked so players notice them. The database refuses two matches on one court at once.
 */
import { prisma, type Prisma } from '@tourneasy/db';
import {
  amsterdamLocalToUtc,
  defaultRestMinutes,
  slotMinutes,
  utcToAmsterdamLocal,
  checkedInFor,
  formatDate,
  formatTime,
  proposeSchedule,
  restConflicts,
  rulesForMatch,
  type FixedSlot,
  type ScheduleMatch,
} from '@tourneasy/shared';
import { messages } from '@tourneasy/shared/i18n';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { appUrl } from '../lib/urls';
import { enqueueEmails } from './notification-service';
import { assertCanManageTournament } from './permissions';
import { eventText, fullName } from './registration-service';
import type { Actor } from './session-service';
import { emailLogo } from './logo-service';

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
              userId: true,
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
      createdAt: true,
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
          koScoringFrom: true,
          koBestOf: true,
          koPointsToWin: true,
          koPointsCap: true,
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
/** The side's club(s), once each: "BC Utrecht" or "BC Utrecht / Amstel" (exports, D79). */
export const sideClub = (entry: MatchRow['entryA']) => {
  const clubs = [
    ...new Set(
      entry?.registration?.participants.map((p) => p.player.club?.name).filter(Boolean) ?? [],
    ),
  ];
  return clubs.length ? clubs.join(' / ') : null;
};
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
      singleGameMinutes: true,
      noShowMinutes: true,
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

/** Slot length of a match: from its number of games, knockout scoring included (D61). */
const minutesFor = (m: MatchRow, t: Pick<TournamentRow, 'matchMinutes' | 'singleGameMinutes'>) =>
  slotMinutes(
    rulesForMatch(m.draw.event, { ...m.draw, round: m.round, bracket: m.bracket }).bestOf,
    t,
  );

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
      minutes: minutesFor(m, t),
    }));
  // Never plan in the past: today starts at the next 5-minute mark (tests plan fixed days).
  const floor = process.env.NODE_ENV === 'test' ? 0 : Math.ceil(Date.now() / 300_000) * 300_000;
  const days = scheduleDays(t)
    .map((d) => ({ ...d, start: new Date(Math.max(d.start.getTime(), floor)) }))
    .filter(
      (d) =>
        d.end.getTime() - d.start.getTime() >=
        Math.min(t.matchMinutes, t.singleGameMinutes) * 60_000,
    );
  const result = proposeSchedule({
    matches: plan,
    courts: courts.map((c) => c.id),
    days,
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
  const row = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: matchSelect });
  const end = new Date(start.getTime() + minutesFor(row, t) * 60_000);
  try {
    await prisma.$transaction(async (tx) => {
      // Update in place, so a moved match counts as "changed" rather than "new".
      await tx.courtSlot.upsert({
        where: { matchId },
        update: { courtId, startsAt: start, endsAt: end },
        create: {
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
  await notifySchedule(m.tournamentId, {
    changed: true,
    key: `move:${matchId}:${start.toISOString()}`,
    matchIds: [matchId],
  });
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
  const t = await loadTournament(ma.tournamentId);
  try {
    await prisma.$transaction(async (tx) => {
      // The slots stay where they are; the matches change places (matchId is unique, hence
      // the three steps).
      await tx.courtSlot.update({ where: { id: sa.id }, data: { matchId: null } });
      await tx.courtSlot.update({ where: { id: sb.id }, data: { matchId: a } });
      await tx.courtSlot.update({ where: { id: sa.id }, data: { matchId: b } });
      // Each match keeps its own length (a one-game match is shorter) from the slot's start.
      for (const [slot, matchId] of [
        [sa, b],
        [sb, a],
      ] as const) {
        const row = await tx.match.findUniqueOrThrow({
          where: { id: matchId },
          select: matchSelect,
        });
        await tx.courtSlot.update({
          where: { id: slot.id },
          data: { endsAt: new Date(slot.startsAt.getTime() + minutesFor(row, t) * 60_000) },
        });
      }
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'schedule.swap',
        entityType: 'Match',
        entityId: a,
        after: { with: b },
        meta,
      });
    });
  } catch (error) {
    if (String(error).includes('court_slot_no_overlap')) throw new AppError('courtTaken');
    throw error;
  }
  await notifySchedule(ma.tournamentId, {
    changed: true,
    key: `swap:${a}:${b}:${Date.now()}`,
    matchIds: [a, b],
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
  if (publish) {
    const t = await prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { schedulePublishedAt: true },
    });
    await notifySchedule(tournamentId, {
      changed: false,
      key: `publish:${t.schedulePublishedAt!.toISOString()}`,
    });
  }
}

/**
 * Emails players their matches (D62): everyone when the schedule is published, or only the
 * players of the given matches when one is moved after publishing.
 */
async function notifySchedule(
  tournamentId: string,
  opts: { changed: boolean; key: string; matchIds?: string[] },
) {
  const t = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { id: true, name: true, slug: true, schedulePublishedAt: true },
  });
  if (!t.schedulePublishedAt) return;
  const [matches, nums] = await Promise.all([
    tournamentMatches(tournamentId),
    numbering(tournamentId),
  ]);
  const slotted = matches.filter((m) => m.slot);
  // Player → their account (players without an account get no email).
  const accountOf = new Map<string, { userId: string; firstName: string }>();
  for (const m of slotted) {
    for (const e of [m.entryA, m.entryB]) {
      for (const p of e?.registration?.participants ?? []) {
        if (p.player.userId)
          accountOf.set(p.player.id, { userId: p.player.userId, firstName: p.player.firstName });
      }
    }
  }
  const targets = new Set(
    (opts.matchIds ? slotted.filter((m) => opts.matchIds!.includes(m.id)) : slotted).flatMap(
      (m) => [...sidePlayers(m.entryA), ...sidePlayers(m.entryB)],
    ),
  );
  const items = {
    nl: slotted.map((m) => toItem(m, 'nl', null, nums)),
    en: slotted.map((m) => toItem(m, 'en', null, nums)),
  };
  const lines = (playerId: string, locale: 'nl' | 'en') =>
    items[locale]
      .filter((i) => i.players.includes(playerId))
      .map((i) => {
        const mineA = slotted
          .find((m) => m.id === i.id)!
          .entryA?.registration?.participants.some((p) => p.player.id === playerId);
        const opponent = (mineA ? i.b : i.a) ?? '—';
        return [
          `${formatDate(i.startsAt!, locale)} ${formatTime(i.startsAt!, locale)}`,
          locale === 'nl' ? `baan ${i.court!.number}` : `court ${i.court!.number}`,
          `${i.event} · ${i.round}`,
          `${locale === 'nl' ? 'tegen' : 'vs'} ${opponent}`,
        ].join(' · ');
      });
  const logo = await emailLogo(t.id, t.name);
  await enqueueEmails(
    [...targets]
      .filter((playerId) => accountOf.has(playerId))
      .map((playerId) => {
        const account = accountOf.get(playerId)!;
        return {
          userId: account.userId,
          type: 'MATCH_SCHEDULED' as const,
          dedupeKey: `SCHEDULE:${t.id}:${account.userId}:${opts.key}`,
          linkPath: `/tournaments/${t.slug}/schedule`,
          template: (locale: 'nl' | 'en') => ({
            kind: 'schedule' as const,
            logo,
            name: account.firstName,
            tournament: t.name,
            changed: opts.changed,
            matches: lines(playerId, locale),
            url: appUrl(locale, `/tournaments/${t.slug}/schedule`),
          }),
        };
      }),
  );
}

/** Round name for lists: "Finale", "Halve finale", "Poule A · ronde 2", "Herkansing ronde 3". */
/**
 * Where a match sits, for the schedule and the desk: the knockout round by name (final,
 * semi-final, quarter-final, last 16/32…), or the stage and round before it (group, round
 * robin, preliminary rounds, Swiss).
 */
export function roundLabel(m: MatchRow, locale: 'nl' | 'en') {
  const d = messages[locale].Draws as Record<string, string>;
  const fill = (key: string, params: Record<string, string | number> = {}) =>
    Object.entries(params).reduce((text, [k, v]) => text.replace(`{${k}}`, String(v)), d[key]!);
  if (m.bracket === 'F') return d.final!;
  if (m.bracket === 'L') return fill('losersRound', { round: m.round });
  if (
    m.draw.type === 'KNOCKOUT' ||
    m.draw.type === 'DOUBLE_KNOCKOUT' ||
    m.draw.stage === 'KNOCKOUT'
  ) {
    return knockoutRoundName(Math.log2(m.draw.size) - m.round, m.round, fill);
  }
  const round = fill('round', { round: m.round }).toLowerCase();
  if (m.draw.name) return `${fill('group', { name: m.draw.name })} · ${round}`;
  const stage =
    m.draw.type === 'SWISS'
      ? fill('swiss')
      : m.draw.type === 'HYBRID_ROUND_ROBIN_KNOCKOUT'
        ? fill('hybrid')
        : fill('roundRobinShort');
  return `${stage} · ${round}`;
}

/** Knockout round names by rounds left before the final (0 = final). */
export function knockoutRoundName(
  left: number,
  round: number,
  fill: (key: string, params?: Record<string, string | number>) => string,
) {
  if (left <= 0) return fill('final');
  if (left === 1) return fill('semiFinal');
  if (left === 2) return fill('quarterFinal');
  if (left === 3) return fill('eighthFinal');
  if (left <= 6) return fill('roundOf', { count: 2 ** (left + 1) });
  return fill('knockoutRound', { round });
}

export type ScheduleItem = ReturnType<typeof toItem>;

function toItem(
  m: MatchRow,
  locale: 'nl' | 'en',
  publishedAt: Date | null,
  nums: Numbering,
  /** The tournament's first day (YYYY-MM-DD): check-ins count per day from there (D74). */
  firstDay?: string,
) {
  const placeholder = (slot: 'A' | 'B') => {
    const feeder = nums.feeders.get(`${m.id}${slot}`);
    const n = feeder ? nums.numberOf.get(feeder.matchId) : undefined;
    if (!n) return null;
    if (feeder!.loser) return locale === 'nl' ? `Verliezer #${n}` : `Loser #${n}`;
    return locale === 'nl' ? `Winnaar #${n}` : `Winner #${n}`;
  };
  return {
    id: m.id,
    number: nums.numberOf.get(m.id) ?? m.matchNumber,
    status: m.status,
    event: eventText(m.draw.event, locale),
    eventId: m.draw.event.id,
    round: roundLabel(m, locale),
    a: sideName(m.entryA) ?? placeholder('A'),
    b: sideName(m.entryB) ?? placeholder('B'),
    aClub: sideClub(m.entryA),
    bClub: sideClub(m.entryB),
    aEntryId: m.entryA?.id ?? null,
    bEntryId: m.entryB?.id ?? null,
    winnerEntryId: m.winnerEntryId,
    sets: m.sets,
    players: [...sidePlayers(m.entryA), ...sidePlayers(m.entryB)],
    court: m.slot?.court ?? null,
    startsAt: m.slot?.startsAt ?? null,
    endsAt: m.slot?.endsAt ?? null,
    // After publishing: a slot added later is "new", a moved one "changed".
    changed:
      publishedAt && m.slot
        ? m.slot.createdAt > publishedAt
          ? ('new' as const)
          : m.slot.updatedAt > publishedAt
            ? ('changed' as const)
            : null
        : null,
    checkIn: [m.entryA, m.entryB].map(
      (e) =>
        e?.registration?.participants.map((p) => ({
          id: p.id,
          name: fullName(p.player),
          // Checked in for this match's day (D74): later tournament days start fresh.
          checkedIn: firstDay
            ? checkedInFor(
                p.checkedInAt,
                utcToAmsterdamLocal(m.slot?.startsAt ?? new Date()).slice(0, 10),
                firstDay,
              )
            : !!p.checkedInAt,
        })) ?? [],
    ),
  };
}

type Numbering = {
  numberOf: Map<string, number>;
  feeders: Map<string, { matchId: string; loser: boolean }>;
};

const STAGE_ORDER: Record<string, number> = { GROUP: 0, MAIN: 1, KNOCKOUT: 2 };

/**
 * Match numbers unique within the tournament (per category, stage, round and group), so the
 * desk never sees two "#1"s; plus which match feeds which slot.
 */
async function numbering(tournamentId: string): Promise<Numbering> {
  const rows = await prisma.match.findMany({
    where: { draw: { status: { not: 'DRAFT' }, event: { tournamentId, deletedAt: null } } },
    select: {
      id: true,
      status: true,
      round: true,
      bracket: true,
      matchNumber: true,
      nextMatchId: true,
      nextMatchSlot: true,
      loserNextMatchId: true,
      loserNextMatchSlot: true,
      draw: {
        select: {
          stage: true,
          groupNumber: true,
          event: { select: { id: true, sortOrder: true, createdAt: true } },
        },
      },
    },
  });
  const bracketOrder = (b: string) => (b === 'W' ? 0 : b === 'L' ? 1 : 2);
  const sorted = rows
    .filter((r) => r.status !== 'BYE' && r.status !== 'CANCELLED')
    .sort(
      (a, b) =>
        a.draw.event.sortOrder - b.draw.event.sortOrder ||
        a.draw.event.createdAt.getTime() - b.draw.event.createdAt.getTime() ||
        a.draw.event.id.localeCompare(b.draw.event.id) ||
        (STAGE_ORDER[a.draw.stage] ?? 1) - (STAGE_ORDER[b.draw.stage] ?? 1) ||
        // Groups: round by round across the groups, as they are played.
        (a.draw.stage === 'GROUP' ? a.round - b.round : 0) ||
        (a.draw.groupNumber ?? 0) - (b.draw.groupNumber ?? 0) ||
        bracketOrder(a.bracket) - bracketOrder(b.bracket) ||
        a.matchNumber - b.matchNumber,
    );
  const numberOf = new Map(sorted.map((r, i) => [r.id, i + 1]));
  const feeders = new Map<string, { matchId: string; loser: boolean }>();
  for (const r of rows) {
    if (r.nextMatchId)
      feeders.set(`${r.nextMatchId}${r.nextMatchSlot}`, { matchId: r.id, loser: false });
    if (r.loserNextMatchId)
      feeders.set(`${r.loserNextMatchId}${r.loserNextMatchSlot}`, { matchId: r.id, loser: true });
  }
  return { numberOf, feeders };
}

/** Organiser view: days with courts and matches, unscheduled matches and rest warnings. */
export async function getSchedule(actor: Actor, tournamentId: string, locale = actor.locale) {
  await assertCanManageTournament(actor, tournamentId);
  const t = await loadTournament(tournamentId);
  const courts = t.venue ? await ensureCourts(prisma, t) : [];
  const [matches, feeders] = await Promise.all([
    tournamentMatches(tournamentId),
    numbering(tournamentId),
  ]);
  const items = matches.map((m) => toItem(m, locale, t.schedulePublishedAt, feeders));
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
  const [matches, feeders] = await Promise.all([tournamentMatches(t.id), numbering(t.id)]);
  return {
    published: true as const,
    items: matches
      .filter((m) => m.slot)
      .map((m) => toItem(m, locale, t.schedulePublishedAt, feeders)),
  };
}

/**
 * Every match of the tournament for the exports (D79), with or without a time and court: a
 * match can be played and scored without being in the planning (a knockout final, say).
 * Access is checked by the caller.
 */
export async function scheduleExportItems(
  tournamentId: string,
  locale: 'nl' | 'en',
  publishedAt: Date | null,
) {
  const [matches, feeders] = await Promise.all([
    tournamentMatches(tournamentId),
    numbering(tournamentId),
  ]);
  return matches.map((m) => toItem(m, locale, publishedAt, feeders));
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
    ...toItem(m as unknown as MatchRow, actor.locale, m.draw.event.tournament.schedulePublishedAt, {
      numberOf: new Map(),
      feeders: new Map(),
    }),
    tournament: m.draw.event.tournament,
  }));
}

/** Desk view: every match of the published draws with what the desk needs, per filter. */
export async function deskMatches(
  actor: Actor,
  tournamentId: string,
  view: 'now' | 'next' | 'open' | 'done',
  locale = actor.locale,
) {
  await assertCanManageTournament(actor, tournamentId);
  const t = await loadTournament(tournamentId);
  const [matches, feeders] = await Promise.all([
    tournamentMatches(tournamentId),
    numbering(tournamentId),
  ]);
  const items = matches.map((m) => ({
    ...toItem(m, locale, t.schedulePublishedAt, feeders, t.startsOn.toISOString().slice(0, 10)),
    version: m.version,
    // Score boxes per match: the knockout scoring where it applies (D61).
    bestOf: rulesForMatch(m.draw.event, { ...m.draw, round: m.round, bracket: m.bracket }).bestOf,
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
    const [matches, feeders] = await Promise.all([tournamentMatches(t.id), numbering(t.id)]);
    const items = matches.map((m) => toItem(m, locale, t.schedulePublishedAt, feeders));
    const onCourt = items.filter((i) => i.status === 'IN_PROGRESS' || i.status === 'CALLED');
    const next = items
      .filter((i) => i.status === 'SCHEDULED' && i.startsAt && i.endsAt! > now)
      .slice(0, 6);
    if (onCourt.length || next.length) out.push({ tournament: t, onCourt, next });
  }
  return out;
}
