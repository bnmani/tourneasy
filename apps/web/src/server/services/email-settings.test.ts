import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import {
  EMAIL_SETTINGS_KEY,
  loadSmtpConfig,
  resetMailerCache,
  setSmtpVerifierForTests,
} from '../email/mailer';
import {
  emailSettingsLog,
  getEmailSettings,
  saveEmailSettings,
  sendTestEmail,
} from './email-settings-service';
import { unlockSettings } from './payment-settings-service';
import { actorFromWebToken, createWebSession } from './session-service';

const SETTINGS = {
  host: 'smtp.example.test',
  port: '465',
  security: 'tls',
  user: 'no-reply@tourneasy.app',
  password: 'mail-secret-123',
  from: 'Tourneasy <no-reply@tourneasy.app>',
};

beforeEach(async () => {
  await resetDatabase();
  resetMailerCache();
  // Simulated mail server: rejects the password "wrong".
  setSmtpVerifierForTests((c) => (c.password === 'wrong' ? '535 Authentication failed' : null));
});
afterEach(() => setSmtpVerifierForTests(undefined));

async function admin() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.ADMIN } });
  const actor = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
  return { ...p, actor };
}

describe('email settings in the portal', () => {
  it('are locked, checked with the mail server, stored encrypted and logged', async () => {
    const a = await admin();
    await expect(saveEmailSettings(a.actor, SETTINGS, meta)).rejects.toMatchObject({
      code: 'settingsLocked',
    });
    await unlockSettings(a.actor, { password: a.password }, meta, new Date(), EMAIL_SETTINGS_KEY);

    await expect(
      saveEmailSettings(a.actor, { ...SETTINGS, password: 'wrong' }, meta),
    ).rejects.toMatchObject({
      code: 'smtpRejected',
      details: { reason: '535 Authentication failed' },
    });
    await expect(
      saveEmailSettings(a.actor, { ...SETTINGS, from: 'nobody' }, meta),
    ).rejects.toMatchObject({
      details: { fields: { from: 'emailInvalid' } },
    });

    await saveEmailSettings(a.actor, SETTINGS, meta);
    const row = await prisma.siteSetting.findUniqueOrThrow({ where: { key: EMAIL_SETTINGS_KEY } });
    expect(JSON.stringify(row.value)).not.toContain('mail-secret-123');
    expect(await loadSmtpConfig()).toMatchObject({
      host: 'smtp.example.test',
      password: 'mail-secret-123',
      source: 'portal',
    });
    expect(await getEmailSettings(a.actor)).toMatchObject({
      active: true,
      source: 'portal',
      stored: {
        host: 'smtp.example.test',
        port: 465,
        passwordSet: true,
        updatedByName: a.actor.name,
      },
    });

    // An empty password keeps the stored one; the log never holds it.
    await saveEmailSettings(
      a.actor,
      { ...SETTINGS, password: '', host: 'smtp2.example.test' },
      meta,
    );
    expect((await loadSmtpConfig())?.password).toBe('mail-secret-123');
    const audit = await prisma.auditLog.findMany({ where: { entityId: EMAIL_SETTINGS_KEY } });
    expect(JSON.stringify(audit)).not.toContain('mail-secret-123');
    expect((await emailSettingsLog(a.actor)).map((e) => e.action)).toEqual([
      'settings.email.update',
      'settings.email.update',
      'settings.unlock',
    ]);
  });

  it('sends a test email to the admin', async () => {
    const a = await admin();
    expect(await sendTestEmail(a.actor, meta)).toBe(a.email);
    expect(lastMailTo(a.email).mail?.subject).toBe('Testmail van Tourneasy');
  });
});
