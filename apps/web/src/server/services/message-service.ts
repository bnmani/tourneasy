/**
 * Messages staff write themselves, sent to the app as a push and kept in the notification list:
 *
 * - food: to everyone whose food order still has to be handed out ("your food is ready"),
 *   from the tournament's food page. Always sent: it's about their own order.
 * - all app users: from the admin portal, with a test to yourself first. Players can switch
 *   these off with "News from the organisers" (ANNOUNCEMENT).
 *
 * A message is one text as written (no second language). Every send is in the audit log.
 */
import { prisma } from '@tourneasy/db';
import { z } from 'zod';
import { apnsConfig } from '../push/apns';
import { writeAudit } from '../lib/audit';
import { validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { foodMessageRecipients } from './food-service';
import { assertAdmin, assertCanManageTournament } from './permissions';
import { pushToUsers } from './push-service';
import type { Actor } from './session-service';

const messageSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(300),
});

export type SendResult = { count: number; pushConfigured: boolean };

const pushConfigured = () => apnsConfig() !== null;

// ── Food ─────────────────────────────────────────────────────────────────────────────

/** How many people a food message would reach right now. */
export async function foodMessageAudience(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  return (await foodMessageRecipients(tournamentId)).length;
}

export async function messageFoodWaiting(
  actor: Actor,
  tournamentId: string,
  input: unknown,
  meta: RequestMeta,
): Promise<SendResult> {
  await assertCanManageTournament(actor, tournamentId);
  const { title, body } = parseInput(messageSchema, input);
  const userIds = await foodMessageRecipients(tournamentId);
  const { slug } = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { slug: true },
  });
  await pushToUsers(
    userIds,
    'ANNOUNCEMENT',
    () => ({ title, body, data: { url: `/tournaments/${slug}` } }),
    { always: true },
  );
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'food.message',
    entityType: 'Tournament',
    entityId: tournamentId,
    after: { title, body, recipients: userIds.length },
    meta,
  });
  return { count: userIds.length, pushConfigured: pushConfigured() };
}

// ── All app users ────────────────────────────────────────────────────────────────────

/** Everyone who signed in to the app with push allowed on at least one phone. */
async function appUserIds(): Promise<string[]> {
  const rows = await prisma.pushDevice.findMany({
    distinct: ['userId'],
    where: { user: { deletedAt: null } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function appUserCount(actor: Actor | null) {
  assertAdmin(actor);
  return (await appUserIds()).length;
}

/** Messages sent to everyone before, newest first, from the audit log. */
export async function appMessageHistory(actor: Actor | null) {
  assertAdmin(actor);
  const rows = await prisma.auditLog.findMany({
    where: { action: 'push.broadcast' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, after: true, actor: { select: { name: true, email: true } } },
  });
  return rows.map((r) => {
    const after = (r.after ?? {}) as { title?: string; body?: string; recipients?: number };
    return {
      at: r.createdAt,
      by: r.actor?.name || r.actor?.email || '—',
      title: after.title ?? '',
      body: after.body ?? '',
      recipients: after.recipients ?? 0,
    };
  });
}

/**
 * Sends a message to every app user, or with `test` only to the admin sending it. Sending to
 * everyone needs `confirmed` (the admin ticked that they checked the test).
 */
export async function messageAllAppUsers(
  actor: Actor | null,
  input: unknown,
  options: { test: boolean },
  meta: RequestMeta,
): Promise<SendResult> {
  assertAdmin(actor);
  const { title, body, confirmed } = parseInput(
    messageSchema.extend({ confirmed: z.boolean().default(false) }),
    input,
  );
  if (!options.test && !confirmed) throw validationError({ confirmed: 'confirmSend' });
  const userIds = options.test ? [actor.userId] : await appUserIds();
  await pushToUsers(userIds, 'ANNOUNCEMENT', () => ({
    title,
    body,
    data: { url: '/notifications' },
  }));
  if (!options.test) {
    await writeAudit(prisma, {
      actorId: actor.userId,
      action: 'push.broadcast',
      entityType: 'User',
      after: { title, body, recipients: userIds.length },
      meta,
    });
  }
  return { count: userIds.length, pushConfigured: pushConfigured() };
}
