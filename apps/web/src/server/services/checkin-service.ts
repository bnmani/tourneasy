/**
 * Check-in at the desk (D74): the players of one tournament day with their first match, check-in
 * for all their entries in one tap, and payment of what's still open at the desk. "Present"
 * means checked in on that day, so a two-day tournament starts each day fresh.
 */
import { prisma } from '@tourneasy/db';
import { amsterdamLocalToUtc, checkedInFor, utcToAmsterdamLocal } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { amountsDue } from '../payments/pricing';
import { markShareAsPaid } from './payment-service';
import { assertCanManageTournament } from './permissions';
import { fullName } from './registration-service';
import type { Actor } from './session-service';

/** The day (YYYY-MM-DD, Dutch time) of a moment. */
export const amsterdamDay = (d: Date) => utcToAmsterdamLocal(d).slice(0, 10);

const ACTIVE = { in: ['CONFIRMED', 'PENDING'] as ('CONFIRMED' | 'PENDING')[] };

function tournamentDays(startsOn: Date, endsOn: Date) {
  const days: string[] = [];
  for (let d = new Date(startsOn); d <= endsOn; d = new Date(d.getTime() + 86_400_000))
    days.push(d.toISOString().slice(0, 10));
  return days;
}

export type CheckInPlayer = Awaited<ReturnType<typeof checkInList>>['players'][number];

/** Everyone playing on the day (all entrants while nothing is scheduled), A–Z. */
export async function checkInList(
  actor: Actor,
  tournamentId: string,
  requestedDay?: string,
  now = new Date(),
) {
  await assertCanManageTournament(actor, tournamentId);
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, startsOn: true, endsOn: true },
  });
  if (!t) throw new AppError('notFound');
  const days = tournamentDays(t.startsOn, t.endsOn);
  const today = amsterdamDay(now);
  const day =
    requestedDay && days.includes(requestedDay)
      ? requestedDay
      : days.includes(today)
        ? today
        : days[0]!;
  const from = amsterdamLocalToUtc(`${day}T00:00`)!;
  const to = new Date(from.getTime() + 86_400_000);

  const shares = await prisma.registrationParticipant.findMany({
    where: {
      active: true,
      registration: { status: ACTIVE, event: { tournamentId, deletedAt: null } },
      player: { deletedAt: null },
    },
    select: {
      id: true,
      registrationId: true,
      paymentStatus: true,
      checkedInAt: true,
      registration: { select: { event: { select: { feeCents: true } } } },
      player: {
        select: {
          id: true,
          firstName: true,
          lastNamePrefix: true,
          lastName: true,
          memberNumber: true,
          club: { select: { name: true } },
        },
      },
    },
  });
  const [matchesToday, anySlot] = await Promise.all([
    prisma.match.findMany({
      where: {
        draw: { event: { tournamentId } },
        status: { notIn: ['BYE', 'CANCELLED'] },
        slot: { startsAt: { gte: from, lt: to } },
      },
      select: {
        slot: { select: { startsAt: true } },
        entryA: { select: { registrationId: true } },
        entryB: { select: { registrationId: true } },
      },
    }),
    prisma.courtSlot.count({ where: { tournamentId } }),
  ]);
  // Per entry: first match time and number of matches that day.
  const byRegistration = new Map<string, { first: Date; count: number }>();
  for (const m of matchesToday) {
    for (const regId of [m.entryA?.registrationId, m.entryB?.registrationId]) {
      if (!regId) continue;
      const cur = byRegistration.get(regId);
      byRegistration.set(regId, {
        first: cur && cur.first < m.slot!.startsAt ? cur.first : m.slot!.startsAt,
        count: (cur?.count ?? 0) + 1,
      });
    }
  }

  const players = new Map<
    string,
    {
      playerId: string;
      name: string;
      sortName: string;
      memberNumber: string;
      club: string | null;
      firstMatch: Date | null;
      matches: number;
      shares: typeof shares;
    }
  >();
  for (const s of shares) {
    const today = byRegistration.get(s.registrationId);
    if (anySlot > 0 && !today) continue;
    const p = players.get(s.player.id) ?? {
      playerId: s.player.id,
      name: fullName(s.player),
      sortName: `${s.player.lastName} ${s.player.firstName}`.toLowerCase(),
      memberNumber: s.player.memberNumber,
      club: s.player.club?.name ?? null,
      firstMatch: null,
      matches: 0,
      shares: [],
    };
    p.shares.push(s);
    if (today) {
      p.matches += today.count;
      if (!p.firstMatch || today.first < p.firstMatch) p.firstMatch = today.first;
    }
    players.set(s.player.id, p);
  }

  const list = await Promise.all(
    [...players.values()].map(async (p) => {
      const unpaid = p.shares.filter(
        (s) => s.paymentStatus === 'UNPAID' && s.registration.event.feeCents > 0,
      );
      const due = unpaid.length ? await amountsDue(p.playerId, tournamentId) : new Map();
      return {
        playerId: p.playerId,
        name: p.name,
        sortName: p.sortName,
        memberNumber: p.memberNumber,
        club: p.club,
        firstMatch: p.firstMatch,
        matches: p.matches,
        present: p.shares.every((s) => checkedInFor(s.checkedInAt, day, days[0]!)),
        unpaidCents: unpaid.reduce((sum, s) => sum + (due.get(s.id) ?? 0), 0),
      };
    }),
  );
  list.sort((a, b) => a.sortName.localeCompare(b.sortName, 'nl'));
  return { days, day, players: list };
}

/** Checks a player in (or undoes it) for all their entries in the tournament. */
export async function setPlayerCheckIn(
  actor: Actor,
  tournamentId: string,
  playerId: string,
  present: boolean,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.registrationParticipant.updateMany({
      where: {
        playerId,
        active: true,
        registration: { status: ACTIVE, event: { tournamentId } },
      },
      data: present
        ? { checkedInAt: new Date(), checkedInById: actor.userId }
        : { checkedInAt: null, checkedInById: null },
    });
    if (count === 0) throw new AppError('notFound');
    await writeAudit(tx, {
      actorId: actor.userId,
      action: present ? 'checkin.player.in' : 'checkin.player.undo',
      entityType: 'PlayerProfile',
      entityId: playerId,
      after: { tournamentId, entries: count },
      meta,
    });
  });
}

/** Records everything the player still owes for this tournament as paid at the desk. */
export async function payAtDesk(
  actor: Actor,
  tournamentId: string,
  playerId: string,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const unpaid = await prisma.registrationParticipant.findMany({
    where: {
      playerId,
      active: true,
      paymentStatus: 'UNPAID',
      registration: { status: ACTIVE, event: { tournamentId, feeCents: { gt: 0 } } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (unpaid.length === 0) throw new AppError('statusTransition');
  for (const s of unpaid) await markShareAsPaid(actor, { participantId: s.id }, meta);
  return unpaid.length;
}
