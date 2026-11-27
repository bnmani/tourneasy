import { prisma } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, resetDatabase } from '@/test/db';
import * as apns from '../push/apns';
import {
  getMyPushPreferences,
  pushToUsers,
  registerPushDevice,
  removePushDevice,
  saveMyPushPreferences,
} from './push-service';
import type { Actor } from './session-service';

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());

const TOKEN = 'a'.repeat(64);
const actorOf = (userId: string) => ({ userId }) as Actor;
const message = () => ({ title: 'T', body: 'B' });

function fakeApns(results: (token: string) => apns.SendResult) {
  vi.spyOn(apns, 'apnsConfig').mockReturnValue({
    key: 'k',
    keyId: 'K',
    teamId: 'T',
    bundleId: 'b',
    sandbox: true,
  });
  return vi
    .spyOn(apns, 'sendApns')
    .mockImplementation(async (_c, tokens) => tokens.map((token) => results(token)));
}

describe('push devices', () => {
  it('registers a phone once and moves it to the account that signs in last', async () => {
    const a = await createPlayer();
    const b = await createPlayer();
    await registerPushDevice(actorOf(a.userId), { token: TOKEN.toUpperCase() });
    await registerPushDevice(actorOf(a.userId), { token: TOKEN });
    expect(await prisma.pushDevice.count()).toBe(1);

    await registerPushDevice(actorOf(b.userId), { token: TOKEN });
    expect((await prisma.pushDevice.findFirstOrThrow()).userId).toBe(b.userId);

    // Only the owner can remove it.
    await removePushDevice(actorOf(a.userId), TOKEN);
    expect(await prisma.pushDevice.count()).toBe(1);
    await removePushDevice(actorOf(b.userId), TOKEN);
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it('refuses something that is not a device token', async () => {
    const a = await createPlayer();
    await expect(registerPushDevice(actorOf(a.userId), { token: 'hello' })).rejects.toMatchObject({
      code: 'validation',
    });
  });
});

describe('sending', () => {
  it('skips people who switched the kind off and forgets dead tokens', async () => {
    const on = await createPlayer();
    const off = await createPlayer();
    const dead = await createPlayer();
    await registerPushDevice(actorOf(on.userId), { token: '1'.repeat(64) });
    await registerPushDevice(actorOf(off.userId), { token: '2'.repeat(64) });
    await registerPushDevice(actorOf(dead.userId), { token: '3'.repeat(64) });
    await saveMyPushPreferences(actorOf(off.userId), { MATCH_SCHEDULED: false });
    const send = fakeApns((token) =>
      token.startsWith('3')
        ? { token, ok: false, status: 410, reason: 'Unregistered' }
        : { token, ok: true, status: 200 },
    );

    await pushToUsers([on.userId, off.userId, dead.userId], 'MATCH_SCHEDULED', message);

    const sent = send.mock.calls.flatMap((call) => call[1]);
    expect(sent).toEqual(expect.arrayContaining(['1'.repeat(64), '3'.repeat(64)]));
    expect(sent).not.toContain('2'.repeat(64));
    expect(await prisma.pushDevice.count({ where: { userId: dead.userId } })).toBe(0);
    // Switched off for "my matches" only: followed players still come through.
    expect(await getMyPushPreferences(actorOf(off.userId))).toEqual([
      { type: 'MATCH_SCHEDULED', enabled: false },
      { type: 'FOLLOWED_PLAYER_MATCH_SCHEDULED', enabled: true },
      { type: 'ANNOUNCEMENT', enabled: true },
    ]);
  });

  it('does nothing without an APNs key', async () => {
    const a = await createPlayer();
    await registerPushDevice(actorOf(a.userId), { token: TOKEN });
    vi.spyOn(apns, 'apnsConfig').mockReturnValue(null);
    const send = vi.spyOn(apns, 'sendApns');
    await pushToUsers([a.userId], 'MATCH_SCHEDULED', message);
    expect(send).not.toHaveBeenCalled();
  });
});
