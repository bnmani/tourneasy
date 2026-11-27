/**
 * The notification list in the app: every push message a player was sent, kept as Notification
 * rows on the IN_APP channel. Saved in both languages, so the list follows the app's language.
 */
import { prisma, type NotificationType } from '@tourneasy/db';
import { z } from 'zod';
import type { PushMessage } from '../push/apns';
import { parseInput } from '../lib/validation';
import type { Actor } from './session-service';

type Locale = 'nl' | 'en';
type Localized = Record<Locale, string>;
type InboxPayload = { title: Localized; body: Localized };

/** How many messages the list shows; older ones stay in the database. */
const LIST_SIZE = 50;

/** Adds one message to each user's list. Never throws: a failed save must not stop the push. */
export async function saveToInbox(
  userIds: string[],
  type: NotificationType,
  message: (locale: Locale) => PushMessage,
) {
  try {
    if (userIds.length === 0) return;
    const nl = message('nl');
    const en = message('en');
    const payload: InboxPayload = {
      title: { nl: nl.title, en: en.title },
      body: { nl: nl.body, en: en.body },
    };
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, locale: true },
    });
    const now = new Date();
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        channel: 'IN_APP' as const,
        status: 'SENT' as const,
        locale: u.locale,
        payload,
        linkPath: en.data?.url ?? null,
        sentAt: now,
      })),
    });
  } catch (error) {
    console.error('[inbox] saving failed', error);
  }
}

export type InboxItem = {
  id: string;
  type: NotificationType;
  title: Localized;
  body: Localized;
  /** Where tapping it goes in the app, e.g. '/tournaments/slug/schedule'. */
  url: string | null;
  createdAt: string;
  read: boolean;
};

/** My latest messages, newest first, and how many are still unread. */
export async function listMyNotifications(
  actor: Actor,
): Promise<{ items: InboxItem[]; unread: number }> {
  const where = { userId: actor.userId, channel: 'IN_APP' as const };
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: LIST_SIZE,
      select: {
        id: true,
        type: true,
        payload: true,
        linkPath: true,
        createdAt: true,
        readAt: true,
      },
    }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return {
    items: rows.map((r) => {
      const payload = r.payload as InboxPayload;
      return {
        id: r.id,
        type: r.type,
        title: payload.title,
        body: payload.body,
        url: r.linkPath,
        createdAt: r.createdAt.toISOString(),
        read: r.readAt !== null,
      };
    }),
    unread,
  };
}

const readSchema = z.object({ ids: z.array(z.string().uuid()).max(LIST_SIZE).optional() });

/** Marks the given messages read, or all of mine when no ids are given. */
export async function markMyNotificationsRead(actor: Actor, input: unknown) {
  const { ids } = parseInput(readSchema, input);
  await prisma.notification.updateMany({
    where: {
      userId: actor.userId,
      channel: 'IN_APP',
      readAt: null,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
}
