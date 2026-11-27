import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import * as apns from '../push/apns';
import { listMyNotifications } from './inbox-service';
import { foodMessageAudience, messageAllAppUsers, messageFoodWaiting } from './message-service';
import { registerPushDevice, saveMyPushPreferences } from './push-service';
import type { Actor } from './session-service';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

const actorOf = (userId: string, roles: Role[] = []) => ({ userId, roles }) as unknown as Actor;
const inbox = async (userId: string) => (await listMyNotifications(actorOf(userId))).items;

function fakeApns() {
  vi.spyOn(apns, 'apnsConfig').mockReturnValue({
    key: 'k',
    keyId: 'K',
    teamId: 'T',
    bundleId: 'b',
    sandbox: true,
  });
  return vi
    .spyOn(apns, 'sendApns')
    .mockImplementation(async (_c, tokens) =>
      tokens.map((token) => ({ token, ok: true, status: 200 })),
    );
}

async function tournamentWithFood() {
  const t = await prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2026-02-01'),
      entryDeadline: new Date('2026-02-01'),
      withdrawalDeadline: new Date('2026-02-01'),
    },
  });
  const item = await prisma.foodItem.create({
    data: { tournamentId: t.id, name: 'Tosti', priceCents: 350 },
  });
  let n = 0;
  const order = (userId: string, data: Record<string, unknown> = {}) =>
    prisma.foodOrder.create({
      data: {
        orderNumber: `F-${++n}`,
        tournamentId: t.id,
        userId,
        status: 'PAID',
        totalCents: 350,
        lines: { create: { foodItemId: item.id, name: 'Tosti', unitPriceCents: 350, quantity: 1 } },
        ...data,
      },
    });
  return { t, order };
}

describe('food message', () => {
  it('reaches only people whose order is still to be handed out, even with news switched off', async () => {
    const admin = await createPlayer();
    const waiting = await createPlayer();
    const muted = await createPlayer();
    const collected = await createPlayer();
    const cancelled = await createPlayer();
    const bystander = await createPlayer();
    const { t, order } = await tournamentWithFood();
    await order(waiting.userId);
    await order(waiting.userId);
    await order(muted.userId, { status: 'PENDING' });
    await order(collected.userId, { collectedAt: new Date() });
    await order(cancelled.userId, { status: 'CANCELLED' });
    // A desk order for a guest belongs to the organiser who typed it in.
    await order(admin.userId, { guestName: 'Oma Jansen' });
    await saveMyPushPreferences(actorOf(muted.userId), { ANNOUNCEMENT: false });
    for (const [i, p] of [waiting, muted, collected, bystander].entries()) {
      await registerPushDevice(actorOf(p.userId), { token: String(i + 1).repeat(64) });
    }
    const send = fakeApns();
    const staff = actorOf(admin.userId, [Role.ADMIN]);

    expect(await foodMessageAudience(staff, t.id)).toBe(2);
    const result = await messageFoodWaiting(
      staff,
      t.id,
      { title: 'Je eten staat klaar', body: 'Haal het op bij de foodstand.' },
      meta,
    );

    expect(result).toEqual({ count: 2, pushConfigured: true });
    const tokens = send.mock.calls.flatMap((c) => c[1]);
    expect(tokens.sort()).toEqual(['1'.repeat(64), '2'.repeat(64)]);
    expect(send.mock.calls[0]![2]).toMatchObject({
      title: 'Je eten staat klaar',
      data: { url: '/tournaments/utrecht-open' },
    });
    expect(await inbox(waiting.userId)).toHaveLength(1);
    for (const p of [collected, cancelled, bystander, admin]) {
      expect(await inbox(p.userId)).toHaveLength(0);
    }
    expect(await prisma.auditLog.count({ where: { action: 'food.message' } })).toBe(1);
  });

  it('is only for the tournament’s organisers', async () => {
    const player = await createPlayer();
    const { t } = await tournamentWithFood();
    await expect(
      messageFoodWaiting(actorOf(player.userId), t.id, { title: 'Hi', body: 'There' }, meta),
    ).rejects.toBeTruthy();
  });
});

describe('message to all app users', () => {
  it('tests on the admin first, then needs the tick to send to everyone with the app', async () => {
    const admin = await createPlayer();
    const a = await createPlayer();
    const b = await createPlayer();
    const noApp = await createPlayer();
    await registerPushDevice(actorOf(a.userId), { token: '1'.repeat(64) });
    await registerPushDevice(actorOf(a.userId), { token: '2'.repeat(64) });
    await registerPushDevice(actorOf(b.userId), { token: '3'.repeat(64) });
    const send = fakeApns();
    const staff = actorOf(admin.userId, [Role.ADMIN]);
    const input = { title: 'Nieuwe app', body: 'Bekijk je schema live.' };

    const test = await messageAllAppUsers(staff, input, { test: true }, meta);
    expect(test.count).toBe(1);
    expect(await inbox(admin.userId)).toHaveLength(1);
    expect(await inbox(a.userId)).toHaveLength(0);
    expect(send).not.toHaveBeenCalled(); // the admin has no phone registered

    await expect(messageAllAppUsers(staff, input, { test: false }, meta)).rejects.toMatchObject({
      code: 'validation',
      details: { fields: { confirmed: 'confirmSend' } },
    });

    const all = await messageAllAppUsers(
      staff,
      { ...input, confirmed: true },
      { test: false },
      meta,
    );
    expect(all.count).toBe(2);
    expect(send.mock.calls.flatMap((c) => c[1]).sort()).toEqual(
      ['1', '2', '3'].map((d) => d.repeat(64)),
    );
    expect((await inbox(a.userId))[0]).toMatchObject({ url: '/notifications' });
    expect(await inbox(noApp.userId)).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { action: 'push.broadcast' } })).toBe(1);
  });

  it('is for admins only', async () => {
    const organiser = await createPlayer();
    await expect(
      messageAllAppUsers(
        actorOf(organiser.userId, [Role.ORGANISER]),
        { title: 'Hi', body: 'There', confirmed: true },
        { test: false },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
