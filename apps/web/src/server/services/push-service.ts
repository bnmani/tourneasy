/**
 * Push notifications to the mobile app (APNs). Players register their phone after signing in
 * in the app; pushes go out when their match goes on court, when their schedule is published
 * or changes, and when a player they follow goes on court. Two kinds can be switched off in
 * the app, stored as NotificationPreference rows on the PUSH channel (default on):
 *
 * - MATCH_SCHEDULED                 my matches: schedule published or changed, on court now
 * - FOLLOWED_PLAYER_MATCH_SCHEDULED players I follow: on court now
 *
 * Sending never throws and never blocks the action that triggered it.
 */
import { prisma, type NotificationType } from '@tourneasy/db';
import { z } from 'zod';
import { apnsConfig, isDeadToken, sendApns, type PushMessage } from '../push/apns';
import { parseInput } from '../lib/validation';
import type { Actor } from './session-service';

export const PUSH_TYPES = [
  'MATCH_SCHEDULED',
  'FOLLOWED_PLAYER_MATCH_SCHEDULED',
] as const satisfies readonly NotificationType[];
export type PushType = (typeof PUSH_TYPES)[number];

// ── Devices ──────────────────────────────────────────────────────────────────────────

const deviceSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{32,200}$/),
  platform: z.enum(['ios']).default('ios'),
});

/** Registers this phone for my account. A token another account had moves to me. */
export async function registerPushDevice(actor: Actor, input: unknown) {
  const { token, platform } = parseInput(deviceSchema, input);
  const value = token.toLowerCase();
  await prisma.pushDevice.upsert({
    where: { token: value },
    create: { userId: actor.userId, token: value, platform },
    update: { userId: actor.userId, platform, lastSeenAt: new Date() },
  });
}

/** Stops pushes to this phone (signing out, or push switched off in the app). */
export async function removePushDevice(actor: Actor, token: string) {
  await prisma.pushDevice.deleteMany({
    where: { userId: actor.userId, token: token.trim().toLowerCase() },
  });
}

// ── Preferences ──────────────────────────────────────────────────────────────────────

export async function getMyPushPreferences(actor: Actor) {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: actor.userId, channel: 'PUSH', type: { in: [...PUSH_TYPES] } },
    select: { type: true, enabled: true },
  });
  return PUSH_TYPES.map((type) => ({
    type,
    enabled: rows.find((r) => r.type === type)?.enabled ?? true,
  }));
}

export async function saveMyPushPreferences(
  actor: Actor,
  enabled: Partial<Record<PushType, boolean>>,
) {
  for (const type of PUSH_TYPES) {
    const value = enabled[type];
    if (typeof value !== 'boolean') continue;
    await prisma.notificationPreference.upsert({
      where: { userId_type_channel: { userId: actor.userId, type, channel: 'PUSH' } },
      create: { userId: actor.userId, type, channel: 'PUSH', enabled: value },
      update: { enabled: value },
    });
  }
}

// ── Sending ──────────────────────────────────────────────────────────────────────────

type Locale = 'nl' | 'en';

/**
 * Sends a message, written per user language, to every phone of the given users that hasn't
 * switched this kind off. Tokens Apple rejects for good are removed.
 */
export async function pushToUsers(
  userIds: string[],
  type: PushType,
  message: (locale: Locale) => PushMessage,
) {
  try {
    const config = apnsConfig();
    const unique = [...new Set(userIds)];
    if (!config || unique.length === 0) return;
    const [devices, off] = await Promise.all([
      prisma.pushDevice.findMany({
        where: { userId: { in: unique } },
        select: { token: true, user: { select: { id: true, locale: true } } },
      }),
      prisma.notificationPreference.findMany({
        where: { userId: { in: unique }, type, channel: 'PUSH', enabled: false },
        select: { userId: true },
      }),
    ]);
    const muted = new Set(off.map((o) => o.userId));
    const byLocale = new Map<Locale, string[]>();
    for (const d of devices) {
      if (muted.has(d.user.id)) continue;
      const locale = d.user.locale as Locale;
      byLocale.set(locale, [...(byLocale.get(locale) ?? []), d.token]);
    }
    const dead: string[] = [];
    for (const [locale, tokens] of byLocale) {
      const results = await sendApns(config, tokens, message(locale));
      dead.push(...results.filter(isDeadToken).map((r) => r.token));
      const failed = results.filter((r) => !r.ok && !isDeadToken(r));
      if (failed.length) {
        console.warn(
          `[push] ${failed.length} of ${results.length} failed`,
          failed.slice(0, 3).map((f) => `${f.status} ${f.reason ?? ''}`),
        );
      }
    }
    if (dead.length) await prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
  } catch (error) {
    console.error('[push] sending failed', error);
  }
}

const courtLabel = (c: { number: number; name: string | null }, locale: Locale) =>
  c.name ?? (locale === 'nl' ? `Baan ${c.number}` : `Court ${c.number}`);

/** "On court now": to the match's players, and to everyone following one of them. */
export async function notifyMatchOnCourt(matchId: string) {
  try {
    const m = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        slot: { select: { court: { select: { number: true, name: true } } } },
        draw: {
          select: { event: { select: { tournament: { select: { name: true, slug: true } } } } },
        },
        entryA: { select: sideSelect },
        entryB: { select: sideSelect },
      },
    });
    if (!m?.slot) return;
    const sides = [m.entryA, m.entryB].map(
      (e) => e?.registration?.participants.map((p) => p.player) ?? [],
    );
    const players = sides.flat();
    const names = sides.map((side) => side.map((p) => p.firstName).join(' / ') || '—');
    const court = m.slot.court;
    const t = m.draw.event.tournament;
    const data = { url: `/tournaments/${t.slug}/schedule`, matchId };

    await pushToUsers(
      players.map((p) => p.userId).filter((id): id is string => !!id),
      'MATCH_SCHEDULED',
      (locale) => ({
        title: locale === 'nl' ? 'Je wedstrijd begint' : 'Your match is on',
        body:
          locale === 'nl'
            ? `${courtLabel(court, locale)} · ${names[0]} tegen ${names[1]} · ${t.name}`
            : `${courtLabel(court, locale)} · ${names[0]} vs ${names[1]} · ${t.name}`,
        data,
        collapseId: `court:${matchId}`,
      }),
    );

    const playerIds = players.map((p) => p.id);
    const follows = await prisma.playerFollow.findMany({
      where: { followedPlayerId: { in: playerIds }, notify: true },
      select: { followerUserId: true, followedPlayerId: true },
    });
    const ownAccounts = new Set(players.map((p) => p.userId));
    const followers = follows.filter((f) => !ownAccounts.has(f.followerUserId));
    // One message per follower, naming the first player they follow in this match.
    const byPlayer = new Map<string, string[]>();
    for (const f of followers) {
      byPlayer.set(f.followedPlayerId, [
        ...(byPlayer.get(f.followedPlayerId) ?? []),
        f.followerUserId,
      ]);
    }
    const told = new Set<string>();
    for (const [playerId, userIds] of byPlayer) {
      const player = players.find((p) => p.id === playerId)!;
      const fresh = userIds.filter((id) => !told.has(id));
      fresh.forEach((id) => told.add(id));
      await pushToUsers(fresh, 'FOLLOWED_PLAYER_MATCH_SCHEDULED', (locale) => ({
        title:
          locale === 'nl'
            ? `${player.firstName} ${player.lastName} speelt nu`
            : `${player.firstName} ${player.lastName} is on court`,
        body: `${courtLabel(court, locale)} · ${names[0]} ${locale === 'nl' ? 'tegen' : 'vs'} ${names[1]} · ${t.name}`,
        data,
        collapseId: `court:${matchId}`,
      }));
    }
  } catch (error) {
    console.error('[push] on-court notice failed', error);
  }
}

/** Schedule published, or some of my matches moved: one short message per player. */
export async function notifySchedulePushed(
  userIds: string[],
  tournament: { name: string; slug: string },
  changed: boolean,
) {
  await pushToUsers(userIds, 'MATCH_SCHEDULED', (locale) => ({
    title: changed
      ? locale === 'nl'
        ? 'Je wedstrijdtijden zijn gewijzigd'
        : 'Your match times changed'
      : locale === 'nl'
        ? 'Het schema staat online'
        : 'The schedule is out',
    body:
      locale === 'nl'
        ? `${tournament.name}: bekijk je wedstrijden en banen.`
        : `${tournament.name}: see your matches and courts.`,
    data: { url: `/tournaments/${tournament.slug}/schedule` },
    collapseId: `schedule:${tournament.slug}`,
  }));
}

const sideSelect = {
  registration: {
    select: {
      participants: {
        where: { active: true },
        select: {
          player: { select: { id: true, userId: true, firstName: true, lastName: true } },
        },
      },
    },
  },
} as const;
