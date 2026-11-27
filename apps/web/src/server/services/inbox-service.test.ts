import { prisma } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, resetDatabase } from '@/test/db';
import * as apns from '../push/apns';
import { listMyNotifications, markMyNotificationsRead } from './inbox-service';
import { pushToUsers, saveMyPushPreferences } from './push-service';
import type { Actor } from './session-service';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

const actorOf = (userId: string) => ({ userId }) as Actor;
const message = (locale: 'nl' | 'en') => ({
  title: locale === 'nl' ? 'Het schema staat online' : 'The schedule is out',
  body: locale === 'nl' ? 'Bekijk je wedstrijden.' : 'See your matches.',
  data: { url: '/tournaments/open-2026/schedule' },
});

describe('notification list', () => {
  it('keeps every message in both languages, even without push set up or switched on', async () => {
    const a = await createPlayer();
    const b = await createPlayer();
    vi.spyOn(apns, 'apnsConfig').mockReturnValue(null);
    await saveMyPushPreferences(actorOf(b.userId), { MATCH_SCHEDULED: false });

    await pushToUsers([a.userId, b.userId, a.userId], 'MATCH_SCHEDULED', message);

    for (const user of [a, b]) {
      const { items, unread } = await listMyNotifications(actorOf(user.userId));
      expect(unread).toBe(1);
      expect(items).toEqual([
        expect.objectContaining({
          type: 'MATCH_SCHEDULED',
          title: { nl: 'Het schema staat online', en: 'The schedule is out' },
          body: { nl: 'Bekijk je wedstrijden.', en: 'See your matches.' },
          url: '/tournaments/open-2026/schedule',
          read: false,
        }),
      ]);
    }
  });

  it('marks some or all of my messages read, and never anyone else’s', async () => {
    const me = await createPlayer();
    const other = await createPlayer();
    vi.spyOn(apns, 'apnsConfig').mockReturnValue(null);
    await pushToUsers([me.userId, other.userId], 'MATCH_SCHEDULED', message);
    await pushToUsers([me.userId], 'MATCH_SCHEDULED', message);

    const first = (await listMyNotifications(actorOf(me.userId))).items[0]!;
    const theirs = (await listMyNotifications(actorOf(other.userId))).items[0]!;
    await markMyNotificationsRead(actorOf(me.userId), { ids: [first.id, theirs.id] });
    expect((await listMyNotifications(actorOf(me.userId))).unread).toBe(1);
    expect((await listMyNotifications(actorOf(other.userId))).unread).toBe(1);

    await markMyNotificationsRead(actorOf(me.userId), {});
    const mine = await listMyNotifications(actorOf(me.userId));
    expect(mine.unread).toBe(0);
    expect(mine.items.every((i) => i.read)).toBe(true);
    expect(await prisma.notification.count({ where: { readAt: null } })).toBe(1);
  });

  it('refuses ids that are not ids', async () => {
    const me = await createPlayer();
    await expect(
      markMyNotificationsRead(actorOf(me.userId), { ids: ['nope'] }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});
