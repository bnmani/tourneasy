import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { getGateway, setGatewayForTests, STRIPE_SETTINGS_KEY } from '../payments/gateway';
import {
  getPaymentSettings,
  lockSettings,
  paymentSettingsLog,
  savePaymentSettings,
  unlockSettings,
} from './payment-settings-service';
import { actorFromWebToken, createWebSession } from './session-service';

const SK = 'sk_test_51Abcdefghijklmnop1234';
const PK = 'pk_test_51Abcdefghijklmnop9876';
const WH = 'whsec_abcdefghijklmnop';

beforeEach(async () => {
  await resetDatabase();
  // Real gateway selection, with Stripe's key check simulated (sk_…_bad is rejected).
  setGatewayForTests(undefined, (key) => !key.endsWith('bad'));
});
afterEach(() => setGatewayForTests(undefined));

async function user(role?: Role) {
  const p = await createPlayer();
  if (role) await prisma.userRole.create({ data: { userId: p.userId, role } });
  const actor = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
  return { ...p, actor };
}

describe('Stripe settings in the portal', () => {
  it('stays locked until the admin re-enters their password, and logs every attempt', async () => {
    const admin = await user(Role.OWNER);
    const player = await user();
    // Owner-only (D78): to others the page doesn't exist.
    await expect(getPaymentSettings(player.actor)).rejects.toMatchObject({ code: 'notFound' });
    await expect(
      savePaymentSettings(admin.actor, { secretKey: SK, publishableKey: PK }, meta),
    ).rejects.toMatchObject({ code: 'settingsLocked' });
    await expect(
      unlockSettings(admin.actor, { password: 'not-my-password' }, meta),
    ).rejects.toMatchObject({ code: 'wrongPassword' });

    const now = new Date();
    const until = await unlockSettings(admin.actor, { password: admin.password }, meta, now);
    expect(until.getTime() - now.getTime()).toBe(10 * 60_000);
    expect((await getPaymentSettings(admin.actor, now)).unlockedUntil).toEqual(until);
    // Ten minutes later it is locked again.
    expect(
      (await getPaymentSettings(admin.actor, new Date(until.getTime() + 1000))).unlockedUntil,
    ).toBeNull();
    await lockSettings(admin.actor);
    expect((await getPaymentSettings(admin.actor)).unlockedUntil).toBeNull();
    expect((await paymentSettingsLog(admin.actor)).map((e) => e.action)).toEqual([
      'settings.unlock',
      'settings.unlockFailed',
    ]);
  });

  it('limits password attempts', async () => {
    const admin = await user(Role.OWNER);
    for (let i = 0; i < 5; i++) {
      await expect(unlockSettings(admin.actor, { password: 'wrong' }, meta)).rejects.toMatchObject({
        code: 'wrongPassword',
      });
    }
    await expect(
      unlockSettings(admin.actor, { password: admin.password }, meta),
    ).rejects.toMatchObject({ code: 'rateLimited' });
  });

  it('stores the keys encrypted, shows only the last four, and switches payments on', async () => {
    const admin = await user(Role.OWNER);
    await unlockSettings(admin.actor, { password: admin.password }, meta);
    expect(await getGateway()).toBeNull();

    await expect(
      savePaymentSettings(
        admin.actor,
        { secretKey: 'sk_test_51Abcdefghijkbad', publishableKey: PK },
        meta,
      ),
    ).rejects.toMatchObject({ details: { fields: { secretKey: 'stripeKeyRejected' } } });
    await expect(
      savePaymentSettings(
        admin.actor,
        { secretKey: SK, publishableKey: 'pk_live_51Abcdefghijklmnop' },
        meta,
      ),
    ).rejects.toMatchObject({ details: { fields: { publishableKey: 'stripeModeMismatch' } } });
    await expect(
      savePaymentSettings(admin.actor, { secretKey: 'hello', publishableKey: PK }, meta),
    ).rejects.toMatchObject({ details: { fields: { secretKey: 'stripeKeyFormat' } } });

    await savePaymentSettings(
      admin.actor,
      { secretKey: SK, publishableKey: PK, webhookSecret: WH },
      meta,
    );
    const row = await prisma.siteSetting.findUniqueOrThrow({ where: { key: STRIPE_SETTINGS_KEY } });
    const raw = JSON.stringify(row.value);
    expect(raw).not.toContain(SK);
    expect(raw).not.toContain(WH);

    const view = await getPaymentSettings(admin.actor);
    expect(view).toMatchObject({
      active: true,
      source: 'portal',
      mode: 'test',
      webhookConfigured: true,
      stored: {
        publishableKey: PK,
        secretKeyLast4: '1234',
        webhookSet: true,
        updatedByName: admin.actor.name,
      },
    });
    expect((await getGateway())?.publishableKey).toBe(PK);

    // Empty fields keep the stored keys; the log never holds key values.
    await savePaymentSettings(
      admin.actor,
      { publishableKey: 'pk_test_51Zyxwvutsrqponm5555' },
      meta,
    );
    expect((await getPaymentSettings(admin.actor)).stored?.secretKeyLast4).toBe('1234');
    const audit = await prisma.auditLog.findMany({ where: { action: 'settings.payments.update' } });
    expect(JSON.stringify(audit)).not.toContain(SK);
    expect(audit.map((a) => (a.after as { changed: string[] }).changed)).toEqual(
      expect.arrayContaining([
        ['secretKey', 'publishableKey', 'webhookSecret'],
        ['publishableKey'],
      ]),
    );
  });
});
