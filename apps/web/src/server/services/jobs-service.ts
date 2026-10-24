/**
 * Timed jobs (Phase 7, D62), run by the cron endpoint every ~15 minutes. Each is safe to run
 * any number of times: notifications are unique per player and occasion.
 * - tournament reminder: from 2 days before the start
 * - entry deadline: from 3 days before entries close, when something is still open
 * - results: in the 3 days after the tournament, once matches were played
 */
import { prisma } from '@tourneasy/db';
import { formatDate, formatDayRange, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { messages } from '@tourneasy/shared/i18n';
import { appUrl } from '../lib/urls';
import { paymentsEnabled } from '../payments/pricing';
import { deliverQueued, enqueueEmails, type QueuedEmail } from './notification-service';
import { expireStaleHolds, eventText, fullName } from './registration-service';
import { eventPodium, playerHistory } from './results-service';
import { emailLogo } from './logo-service';

const DAY = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);
const tr = (locale: AppLocale, key: string, params: Record<string, string> = {}) =>
  Object.entries(params).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, v),
    (messages[locale].Email as Record<string, string>)[key] ?? key,
  );

/** Players (with an account) actively entered in a tournament: account → player. */
async function participants(tournamentId: string) {
  const rows = await prisma.registrationParticipant.findMany({
    where: {
      active: true,
      registration: {
        status: { in: ['CONFIRMED', 'PENDING'] },
        event: { tournamentId, deletedAt: null },
      },
      player: { userId: { not: null }, deletedAt: null },
    },
    select: { player: { select: { id: true, userId: true, firstName: true } } },
  });
  return [...new Map(rows.map((r) => [r.player.userId!, r.player])).values()];
}

export async function tournamentReminders(now = new Date()) {
  const tournaments = await prisma.tournament.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      status: { notIn: ['DRAFT', 'ARCHIVED'] },
      startsOn: { gt: now, lte: new Date(now.getTime() + 2 * DAY) },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      startsOn: true,
      endsOn: true,
      schedulePublishedAt: true,
      venue: { select: { name: true, street: true, houseNumber: true, city: true } },
    },
  });
  let queued = 0;
  for (const t of tournaments) {
    const logo = await emailLogo(t.id, t.name);
    const players = await participants(t.id);
    const firstSlots = t.schedulePublishedAt
      ? await prisma.courtSlot.findMany({
          where: {
            tournamentId: t.id,
            isPublished: true,
            match: {
              OR: [
                {
                  entryA: {
                    registration: {
                      participants: {
                        some: { playerId: { in: players.map((p) => p.id) }, active: true },
                      },
                    },
                  },
                },
                {
                  entryB: {
                    registration: {
                      participants: {
                        some: { playerId: { in: players.map((p) => p.id) }, active: true },
                      },
                    },
                  },
                },
              ],
            },
          },
          orderBy: { startsAt: 'asc' },
          select: {
            startsAt: true,
            court: { select: { number: true } },
            match: {
              select: {
                entryA: {
                  select: {
                    registration: { select: { participants: { select: { playerId: true } } } },
                  },
                },
                entryB: {
                  select: {
                    registration: { select: { participants: { select: { playerId: true } } } },
                  },
                },
              },
            },
          },
        })
      : [];
    const firstFor = (playerId: string) =>
      firstSlots.find((s) =>
        [s.match?.entryA, s.match?.entryB].some((e) =>
          e?.registration?.participants.some((p) => p.playerId === playerId),
        ),
      );
    const items: QueuedEmail[] = players.map((p) => ({
      userId: p.userId!,
      type: 'TOURNAMENT_REMINDER',
      dedupeKey: `REMINDER:${t.id}:${p.userId}`,
      linkPath: `/tournaments/${t.slug}`,
      template: (locale) => {
        const first = firstFor(p.id);
        return {
          kind: 'tournamentReminder',
          logo,
          name: p.firstName,
          tournament: t.name,
          when: formatDayRange(day(t.startsOn), day(t.endsOn), locale, 'long'),
          venue: t.venue
            ? `${t.venue.name}, ${t.venue.street} ${t.venue.houseNumber}, ${t.venue.city}`
            : null,
          firstMatch: first
            ? `${formatDate(first.startsAt, locale)} ${formatTime(first.startsAt, locale)} · ${locale === 'nl' ? 'baan' : 'court'} ${first.court.number}`
            : null,
          url: appUrl(locale, `/tournaments/${t.slug}${t.schedulePublishedAt ? '/schedule' : ''}`),
        };
      },
    }));
    queued += await enqueueEmails(items);
  }
  return queued;
}

export async function deadlineReminders(now = new Date()) {
  const tournaments = await prisma.tournament.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      status: 'OPEN',
      registrationClosesAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY) },
    },
    select: { id: true, name: true, slug: true, registrationClosesAt: true },
  });
  const online = await paymentsEnabled();
  let queued = 0;
  for (const t of tournaments) {
    const logo = await emailLogo(t.id, t.name);
    const eventSelect = {
      discipline: true,
      name: true,
      ageCategory: { select: { code: true, name: true } },
      levelClass: { select: { code: true } },
    } as const;
    // Things still open, per account.
    const open = new Map<string, { firstName: string; items: ((l: AppLocale) => string)[] }>();
    const add = (userId: string, firstName: string, item: (l: AppLocale) => string) => {
      const entry = open.get(userId) ?? { firstName, items: [] };
      entry.items.push(item);
      open.set(userId, entry);
    };
    const shares = await prisma.registrationParticipant.findMany({
      where: {
        active: true,
        player: { userId: { not: null } },
        registration: {
          status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] },
          event: { tournamentId: t.id, deletedAt: null },
        },
      },
      select: {
        role: true,
        paymentStatus: true,
        player: { select: { userId: true, firstName: true } },
        registration: {
          select: {
            status: true,
            event: { select: { ...eventSelect, feeCents: true } },
            participants: { where: { active: true }, select: { id: true } },
            invites: { where: { status: 'PENDING' }, select: { id: true } },
          },
        },
      },
    });
    for (const s of shares) {
      const r = s.registration;
      const label = (l: AppLocale) => eventText(r.event, l);
      if (
        online &&
        s.paymentStatus === 'UNPAID' &&
        r.event.feeCents > 0 &&
        r.status !== 'WAITLISTED'
      )
        add(s.player.userId!, s.player.firstName, (l) =>
          tr(l, 'deadlineUnpaid', { event: label(l) }),
        );
      if (s.role === 'PRIMARY' && r.participants.length === 1 && r.invites.length > 0)
        add(s.player.userId!, s.player.firstName, (l) =>
          tr(l, 'deadlineInviteSent', { event: label(l) }),
        );
    }
    const invites = await prisma.partnerInvite.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { gt: now },
        toPlayer: { userId: { not: null } },
        registration: {
          status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] },
          event: { tournamentId: t.id },
        },
      },
      select: {
        toPlayer: { select: { userId: true, firstName: true } },
        fromPlayer: { select: { firstName: true, lastNamePrefix: true, lastName: true } },
        registration: { select: { event: { select: eventSelect } } },
      },
    });
    for (const i of invites) {
      add(i.toPlayer!.userId!, i.toPlayer!.firstName, (l) =>
        tr(l, 'deadlineInviteReceived', {
          event: eventText(i.registration.event, l),
          from: fullName(i.fromPlayer),
        }),
      );
    }
    const looking = await prisma.partnerRequest.findMany({
      where: {
        closedAt: null,
        event: { tournamentId: t.id, deletedAt: null },
        player: { userId: { not: null } },
      },
      select: {
        player: { select: { userId: true, firstName: true } },
        event: { select: eventSelect },
      },
    });
    for (const lk of looking) {
      add(lk.player.userId!, lk.player.firstName, (l) =>
        tr(l, 'deadlineLooking', { event: eventText(lk.event, l) }),
      );
    }
    queued += await enqueueEmails(
      [...open.entries()].map(([userId, o]) => ({
        userId,
        type: 'ENTRY_DEADLINE_REMINDER',
        dedupeKey: `DEADLINE:${t.id}:${userId}`,
        linkPath: '/account?tab=upcoming',
        template: (locale) => ({
          kind: 'deadlineReminder',
          logo,
          name: o.firstName,
          tournament: t.name,
          deadline: `${formatDate(t.registrationClosesAt, locale)} ${formatTime(t.registrationClosesAt, locale)}`,
          items: o.items.map((f) => f(locale)),
          url: appUrl(locale, '/account?tab=upcoming'),
        }),
      })),
    );
  }
  return queued;
}

export async function resultsSummaries(now = new Date()) {
  const today = new Date(day(now));
  const tournaments = await prisma.tournament.findMany({
    where: {
      isPublished: true,
      deletedAt: null,
      endsOn: { lt: today, gte: new Date(today.getTime() - 3 * DAY) },
      events: {
        some: {
          draws: {
            some: { matches: { some: { status: { in: ['COMPLETED', 'WALKOVER', 'RETIRED'] } } } },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      events: {
        where: { deletedAt: null },
        select: {
          id: true,
          discipline: true,
          name: true,
          ageCategory: { select: { code: true, name: true } },
          levelClass: { select: { code: true } },
        },
      },
    },
  });
  let queued = 0;
  for (const t of tournaments) {
    const logo = await emailLogo(t.id, t.name);
    const podiums = await Promise.all(
      t.events.map(async (e) => ({ event: e, podium: await eventPodium(e.id) })),
    );
    const players = await participants(t.id);
    const items: QueuedEmail[] = [];
    for (const p of players) {
      const profile = await prisma.playerProfile.findUniqueOrThrow({
        where: { id: p.id },
        select: { firstName: true, lastNamePrefix: true, lastName: true },
      });
      const me = fullName(profile);
      const history = (await playerHistory(p.id, 50)).filter((h) => h.tournament.slug === t.slug);
      if (history.length === 0) continue;
      const placings = (l: AppLocale) =>
        podiums.flatMap(({ event, podium }) => {
          if (!podium?.first) return [];
          const has = (name: string | null) => !!name && name.split(' / ').includes(me);
          const place = has(podium.first)
            ? 'placeFirst'
            : has(podium.second)
              ? 'placeSecond'
              : podium.third.some(has)
                ? 'placeThird'
                : null;
          return place
            ? [tr(l, 'placing', { event: eventText(event, l), place: tr(l, place) })]
            : [];
        });
      items.push({
        userId: p.userId!,
        type: 'TOURNAMENT_RESULTS',
        dedupeKey: `RESULTS:${t.id}:${p.userId}`,
        linkPath: `/tournaments/${t.slug}/draws`,
        template: (locale) => ({
          kind: 'results',
          logo,
          name: p.firstName,
          tournament: t.name,
          placings: placings(locale),
          matches: history.map(
            (h) =>
              `${eventText(h.event as never, locale)}: ${h.won ? (locale === 'nl' ? 'gewonnen' : 'won') : locale === 'nl' ? 'verloren' : 'lost'} ${locale === 'nl' ? 'tegen' : 'vs'} ${h.opponent}${h.score ? ` (${h.score})` : h.walkover ? ' (w.o.)' : ''}`,
          ),
          url: appUrl(locale, `/tournaments/${t.slug}/draws`),
        }),
      });
    }
    queued += await enqueueEmails(items);
  }
  return queued;
}

/** Everything the cron endpoint runs; returns what happened, for the run log. */
export async function runHousekeeping(now = new Date()) {
  const released = await expireStaleHolds(now);
  const reminders = await tournamentReminders(now);
  const deadlines = await deadlineReminders(now);
  const results = await resultsSummaries(now);
  const delivered = await deliverQueued(500);
  return { released, reminders, deadlines, results, ...delivered };
}
