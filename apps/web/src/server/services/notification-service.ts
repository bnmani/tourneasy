/**
 * Email notifications (Phase 7, D62). Emails are queued as Notification rows (one per user and
 * occasion, kept unique by a dedupe key so a job or a double click never sends twice) and sent
 * in the background, so publishing a schedule doesn't wait for hundreds of emails. The cron job
 * sends whatever is left over. Optional kinds (reminders, results, news) respect the player's
 * preferences and carry an unsubscribe link; essential ones (schedule) always go out.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma, type NotificationType, type Prisma } from '@tourneasy/db';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { sendMail } from '../email/mailer';
import { renderEmail, type Template } from '../email/templates';
import { AppError } from '../lib/errors';
import { appUrl } from '../lib/urls';
import type { Actor } from './session-service';

/** Kinds a player can switch off (D62). Everything else is essential. */
export const OPTIONAL_TYPES = [
  'TOURNAMENT_REMINDER',
  'ENTRY_DEADLINE_REMINDER',
  'TOURNAMENT_RESULTS',
  'ANNOUNCEMENT',
] as const satisfies readonly NotificationType[];
export type OptionalType = (typeof OPTIONAL_TYPES)[number];
const isOptional = (t: NotificationType): t is OptionalType =>
  (OPTIONAL_TYPES as readonly string[]).includes(t);

// ── Unsubscribe links ──────────────────────────────────────────────────────────────

function signingKey(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET is not set');
  return 'tourneasy-development-unsubscribe-key';
}

function sign(userId: string, type: string) {
  return createHmac('sha256', signingKey())
    .update(`unsubscribe:${userId}:${type}`)
    .digest('base64url')
    .slice(0, 32);
}

export function unsubscribeUrl(locale: AppLocale, userId: string, type: OptionalType) {
  const q = new URLSearchParams({ u: userId, t: type, s: sign(userId, type) });
  return appUrl(locale, `/unsubscribe?${q}`);
}

/** Turns one optional kind off for the user in the signed link; false when the link is wrong. */
export async function unsubscribe(userId: string, type: string, signature: string) {
  if (!isOptional(type as NotificationType)) return false;
  const expected = Buffer.from(sign(userId, type));
  const given = Buffer.from(signature ?? '');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return false;
  await setPreference(userId, type as OptionalType, false);
  return true;
}

async function setPreference(userId: string, type: OptionalType, enabled: boolean) {
  await prisma.notificationPreference.upsert({
    where: { userId_type_channel: { userId, type, channel: 'EMAIL' } },
    create: { userId, type, channel: 'EMAIL', enabled },
    update: { enabled },
  });
}

/** My email preferences: every optional kind with on/off (default on). */
export async function getMyPreferences(actor: Actor) {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: actor.userId, channel: 'EMAIL' },
    select: { type: true, enabled: true },
  });
  return OPTIONAL_TYPES.map((type) => ({
    type,
    enabled: rows.find((r) => r.type === type)?.enabled ?? true,
  }));
}

export async function saveMyPreferences(
  actor: Actor,
  enabled: Partial<Record<OptionalType, boolean>>,
) {
  for (const type of OPTIONAL_TYPES) {
    if (typeof enabled[type] === 'boolean') await setPreference(actor.userId, type, enabled[type]!);
  }
}

// ── Queue and delivery ─────────────────────────────────────────────────────────────

export type QueuedEmail = {
  userId: string;
  type: NotificationType;
  /** Unique per occasion, e.g. "REMINDER:{tournamentId}:{userId}". */
  dedupeKey: string;
  /** Built per recipient language. */
  template: (locale: AppLocale) => Template;
  linkPath?: string;
};

type Payload = { to: string; template: Template };

/** Queues emails (skipping duplicates and switched-off kinds) and starts sending them. */
export async function enqueueEmails(items: QueuedEmail[]): Promise<number> {
  if (items.length === 0) return 0;
  const users = await prisma.user.findMany({
    where: {
      id: { in: [...new Set(items.map((i) => i.userId))] },
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, email: true, locale: true, anonymisedAt: true },
  });
  const byId = new Map(users.filter((u) => !u.anonymisedAt).map((u) => [u.id, u]));
  const off = new Set(
    (
      await prisma.notificationPreference.findMany({
        where: { userId: { in: [...byId.keys()] }, channel: 'EMAIL', enabled: false },
        select: { userId: true, type: true },
      })
    ).map((p) => `${p.userId}:${p.type}`),
  );
  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const item of items) {
    const user = byId.get(item.userId);
    if (!user) continue;
    const locale = user.locale as AppLocale;
    const skipped = isOptional(item.type) && off.has(`${item.userId}:${item.type}`);
    rows.push({
      userId: item.userId,
      type: item.type,
      channel: 'EMAIL',
      status: skipped ? 'SKIPPED' : 'QUEUED',
      locale,
      payload: { to: user.email, template: item.template(locale) } satisfies Payload as never,
      dedupeKey: item.dedupeKey,
      linkPath: item.linkPath ?? null,
    });
  }
  const { count } = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  kickDelivery();
  return count;
}

let delivering: Promise<{ sent: number; failed: number; held: number }> | null = null;

/** Sends queued emails (oldest first). One run at a time per server process. */
export function deliverQueued(
  limit = 200,
): Promise<{ sent: number; failed: number; held: number }> {
  delivering ??= (async () => {
    let sent = 0;
    let failed = 0;
    let held = 0;
    try {
      const queued = await prisma.notification.findMany({
        where: { status: 'QUEUED', channel: 'EMAIL' },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, userId: true, type: true, locale: true, payload: true },
      });
      for (const n of queued) {
        // Claim it first, so a parallel run on another server can't send it too.
        const claimed = await prisma.notification.updateMany({
          where: { id: n.id, status: 'QUEUED' },
          data: { status: 'SENT', sentAt: new Date() },
        });
        if (claimed.count === 0) continue;
        const { to, template } = n.payload as unknown as Payload;
        const locale = n.locale as AppLocale;
        try {
          const result = await sendMail(
            await renderEmail(
              to,
              locale,
              template,
              isOptional(n.type)
                ? {
                    unsubscribeUrl: unsubscribeUrl(locale, n.userId, n.type),
                    preferencesUrl: appUrl(locale, '/account/notifications'),
                  }
                : {},
            ),
          );
          if (result === 'held') {
            held += 1;
            await prisma.notification.update({
              where: { id: n.id },
              data: { status: 'SKIPPED', sentAt: null, error: 'sendingPaused' },
            });
          } else sent += 1;
        } catch (error) {
          failed += 1;
          await prisma.notification.update({
            where: { id: n.id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message.slice(0, 300) : 'error',
            },
          });
        }
      }
    } finally {
      delivering = null;
    }
    return { sent, failed, held };
  })();
  return delivering;
}

/** Starts sending in the background (the request that queued the emails doesn't wait). */
export function kickDelivery() {
  if (process.env.EMAIL_TRANSPORT === 'memory') return; // tests deliver explicitly
  void deliverQueued().catch((error) => console.error('[notifications] delivery failed', error));
}

/** Admin overview numbers (queue health), e.g. for the email settings page. */
export async function notificationStats(actor: Actor) {
  if (!actor.roles.includes('ADMIN')) throw new AppError('forbidden');
  const rows = await prisma.notification.groupBy({
    by: ['status'],
    where: { channel: 'EMAIL', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;
}
