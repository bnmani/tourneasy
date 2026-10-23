import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import {
  EMAIL_SETTINGS_KEY,
  outbox,
  sendMail,
  loadSmtpConfig,
  resetMailerCache,
  senderDomain,
  setSmtpVerifierForTests,
} from '../email/mailer';
import {
  emailSettingsLog,
  getEmailSettings,
  saveEmailSettings,
  sendTestEmail,
  setEmailSending,
} from './email-settings-service';
import { deliverQueued, enqueueEmails } from './notification-service';
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

  it('sends a test email in the normal layout, to the admin or another address', async () => {
    const a = await admin();
    expect(await sendTestEmail(a.actor, {}, meta)).toBe(a.email);
    expect(lastMailTo(a.email).mail?.subject).toBe('Je e-mailinstellingen werken');
    expect(lastMailTo(a.email).mail?.html).toContain('Tourneasy');
    expect(await sendTestEmail(a.actor, { to: 'Check@Mail-Tester.test' }, meta)).toBe(
      'check@mail-tester.test',
    );
    await expect(sendTestEmail(a.actor, { to: 'nope' }, meta)).rejects.toMatchObject({
      details: { fields: { to: 'emailInvalid' } },
    });
  });

  it('greets the mail server as the sender domain', () => {
    expect(senderDomain('Tourneasy <no-reply@tourneasy.app>')).toBe('tourneasy.app');
    expect(senderDomain('info@Example.NL')).toBe('example.nl');
  });
});

describe('pausing email for testing', () => {
  it('only reaches admins, organisers and test addresses while paused, and is logged', async () => {
    const a = await admin();
    const [anna, tester, org] = [await createPlayer(), await createPlayer(), await createPlayer()];
    await prisma.userRole.create({ data: { userId: org.userId, role: Role.ORGANISER } });
    await expect(
      setEmailSending(a.actor, { paused: '1', allow: 'nope' }, meta),
    ).rejects.toMatchObject({ code: 'validation' });
    await setEmailSending(a.actor, { paused: '1', allow: `${tester.email.toUpperCase()}, ` }, meta);

    const news = (p: { userId: string }) => ({
      userId: p.userId,
      type: 'ANNOUNCEMENT' as const,
      dedupeKey: `TEST:${p.userId}`,
      linkPath: '/',
      template: () => ({ kind: 'settingsTest' as const, name: 'x', url: 'https://x.test' }),
    });
    outbox.length = 0; // sign-up mails of the players above
    await enqueueEmails([anna, tester, org, a].map(news));
    expect(await deliverQueued()).toMatchObject({ sent: 3, held: 1 });
    expect(outbox.map((m) => m.to).sort()).toEqual([a.email, org.email, tester.email].sort());
    expect(await prisma.notification.findFirst({ where: { userId: anna.userId } })).toMatchObject({
      status: 'SKIPPED',
      error: 'sendingPaused',
    });

    // What the person asked for themselves still goes.
    const mail = { to: anna.email, subject: 'Reset', text: 't', html: 'h' };
    expect(await sendMail(mail)).toBe('held');
    expect(await sendMail(mail, { always: true })).toBe('sent');

    await setEmailSending(a.actor, { paused: '0', allow: '' }, meta);
    expect(await sendMail(mail)).toBe('sent');
    expect((await getEmailSettings(a.actor)).sending).toMatchObject({ paused: false, allow: [] });
    expect((await emailSettingsLog(a.actor)).map((l) => l.action)).toEqual([
      'settings.email.resumed',
      'settings.email.paused',
    ]);
  });
});
