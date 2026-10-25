/**
 * Where a tournament stands (D75): the setup checklist on its overview page and the
 * "needs attention" items on the portal dashboard come from the same facts.
 */
import { prisma } from '@tourneasy/db';
import { assertCanManageTournament } from './permissions';
import { managedTournaments } from './tournament-service';
import type { Actor } from './session-service';

const ACTIVE = { in: ['CONFIRMED', 'PENDING'] as ('CONFIRMED' | 'PENDING')[] };

async function facts(tournamentId: string) {
  const t = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: {
      id: true,
      name: true,
      status: true,
      isPublished: true,
      venueId: true,
      startsOn: true,
      endsOn: true,
      registrationClosesAt: true,
      schedulePublishedAt: true,
    },
  });
  const [events, entries, waitlisted, unpaid, refunds, unscheduled, slots] = await Promise.all([
    prisma.tournamentEvent.findMany({
      where: { tournamentId, deletedAt: null },
      select: {
        id: true,
        _count: { select: { registrations: { where: { status: ACTIVE } } } },
        draws: { select: { status: true } },
      },
    }),
    prisma.registration.count({
      where: { status: ACTIVE, event: { tournamentId, deletedAt: null } },
    }),
    prisma.registration.count({
      where: { status: 'WAITLISTED', event: { tournamentId, deletedAt: null } },
    }),
    prisma.registrationParticipant.count({
      where: {
        active: true,
        paymentStatus: 'UNPAID',
        registration: {
          status: ACTIVE,
          event: { tournamentId, deletedAt: null, feeCents: { gt: 0 } },
        },
      },
    }),
    prisma.refund.count({
      where: { status: 'REQUESTED', payment: { order: { tournamentId } } },
    }),
    prisma.match.count({
      where: {
        draw: { status: { not: 'DRAFT' }, event: { tournamentId, deletedAt: null } },
        status: { in: ['SCHEDULED', 'CALLED'] },
        slot: null,
        entryAId: { not: null },
      },
    }),
    prisma.courtSlot.count({ where: { tournamentId } }),
  ]);
  // Categories with at least 2 entries need a published draw.
  const needDraw = events.filter((e) => e._count.registrations >= 2);
  const drawsMissing = needDraw.filter((e) => !e.draws.some((d) => d.status !== 'DRAFT')).length;
  return {
    t,
    events: events.length,
    entries,
    waitlisted,
    unpaid,
    refunds,
    unscheduled,
    slots,
    needDraw: needDraw.length,
    drawsMissing,
  };
}

export type SetupStep = { key: string; done: boolean; href: string };

/** The steps from a new tournament to a published schedule, in order. */
export async function setupChecklist(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const f = await facts(tournamentId);
  const base = `/admin/tournaments/${tournamentId}`;
  const steps: SetupStep[] = [
    { key: 'venue', done: !!f.t.venueId, href: `${base}/settings#edit` },
    { key: 'events', done: f.events > 0, href: `${base}#events` },
    { key: 'published', done: f.t.isPublished, href: `${base}#status` },
    { key: 'open', done: f.t.status !== 'DRAFT', href: `${base}#status` },
    { key: 'entries', done: f.entries > 0, href: `${base}/entries` },
    { key: 'draws', done: f.needDraw > 0 && f.drawsMissing === 0, href: `${base}/draws` },
    { key: 'schedule', done: f.slots > 0 && f.unscheduled === 0, href: `${base}/schedule` },
    { key: 'schedulePublished', done: !!f.t.schedulePublishedAt, href: `${base}/schedule` },
  ];
  return { steps, next: steps.find((s) => !s.done)?.key ?? null };
}

export type AttentionItem = {
  tournamentId: string;
  tournament: string;
  key: 'refunds' | 'unpaid' | 'waitlist' | 'notPublished' | 'drawsMissing' | 'scheduleNotPublished';
  count: number;
  href: string;
};

const DAY = 86_400_000;

/**
 * Things to act on across the tournaments the actor manages that haven't finished more than a
 * week ago: open refund requests, unpaid entries, waiting lists, entries open while
 * unpublished, missing draws after entries closed, and an unpublished schedule close to the day.
 */
export async function needsAttention(actor: Actor, now = new Date()): Promise<AttentionItem[]> {
  const tournaments = (await managedTournaments(actor, 50)).filter(
    (x) => x.endsOn.getTime() >= now.getTime() - 7 * DAY,
  );
  const items: AttentionItem[] = [];
  for (const x of tournaments) {
    const f = await facts(x.id);
    const base = `/admin/tournaments/${x.id}`;
    const add = (key: AttentionItem['key'], count: number, href: string) => {
      if (count > 0) items.push({ tournamentId: x.id, tournament: x.name, key, count, href });
    };
    add('refunds', f.refunds, `${base}/payments`);
    add('unpaid', f.unpaid, `${base}/entries`);
    add('waitlist', f.waitlisted, `${base}/entries`);
    add('notPublished', f.t.status === 'OPEN' && !f.t.isPublished ? 1 : 0, `${base}#status`);
    add(
      'drawsMissing',
      f.t.registrationClosesAt.getTime() < now.getTime() ? f.drawsMissing : 0,
      `${base}/draws`,
    );
    add(
      'scheduleNotPublished',
      f.slots > 0 && !f.t.schedulePublishedAt && f.t.startsOn.getTime() - now.getTime() < 14 * DAY
        ? 1
        : 0,
      `${base}/schedule`,
    );
  }
  // Money first, then what blocks the day.
  const order: AttentionItem['key'][] = [
    'refunds',
    'notPublished',
    'drawsMissing',
    'scheduleNotPublished',
    'unpaid',
    'waitlist',
  ];
  return items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
