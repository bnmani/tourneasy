/**
 * SMTP settings managed in the portal (D58), locked like the Stripe keys (D54): unlocked with
 * the admin's password for 10 minutes, the password stored encrypted and never shown again,
 * every change logged. The settings are checked by logging in to the mail server before they
 * are saved; a test email goes to the admin's own address.
 */
import { prisma, type Prisma } from '@tourneasy/db';
import { emailSettingsSchema } from '@tourneasy/shared';
import { z } from 'zod';
import { sendMail } from '../email/mailer';
import {
  EMAIL_SENDING_KEY,
  EMAIL_SETTINGS_KEY,
  loadSendingSettings,
  loadSmtpConfig,
  resetMailerCache,
  verifySmtp,
  type SendingSettings,
  type StoredEmailSettings,
} from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { appUrl } from '../lib/urls';
import { AppError, validationError } from '../lib/errors';
import { enforce } from '../lib/rate-limit';
import type { RequestMeta } from '../lib/request-meta';
import { canEncrypt, decryptSecret, encryptSecret } from '../lib/secret-box';
import { parseInput } from '../lib/validation';
import { assertUnlocked, elevatedUntil } from './payment-settings-service';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';

async function stored(): Promise<StoredEmailSettings | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: EMAIL_SETTINGS_KEY } });
  return (row?.value as StoredEmailSettings | undefined) ?? null;
}

/** What the page shows: status and settings without the password. */
export async function getEmailSettings(actor: Actor, now = new Date()) {
  assertAdmin(actor);
  const [settings, config, until, sending] = await Promise.all([
    stored(),
    loadSmtpConfig(),
    elevatedUntil(actor, now),
    loadSendingSettings(),
  ]);
  return {
    sending: sending && { ...sending, updatedAt: new Date(sending.updatedAt) },
    unlockedUntil: until,
    canEncrypt: canEncrypt(),
    active: config !== null,
    source: config?.source ?? null,
    unreadable: !!settings?.passwordBox && decryptSecret(settings.passwordBox) === null,
    stored: settings && {
      host: settings.host,
      port: settings.port,
      security: settings.security,
      user: settings.user,
      passwordSet: !!settings.passwordBox,
      from: settings.from,
      updatedAt: new Date(settings.updatedAt),
      updatedByName: settings.updatedByName,
    },
  };
}

/** Saves the SMTP settings after a successful login to the mail server. */
export async function saveEmailSettings(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  await assertUnlocked(actor, now);
  if (!canEncrypt()) throw new AppError('encryptionUnavailable');
  const data = parseInput(emailSettingsSchema, input);
  const current = await stored();
  // An empty password field keeps the stored password (only for the same login).
  const keepPassword =
    !data.password && current?.passwordBox && current.user === (data.user ?? null);
  const password = data.password ?? (keepPassword ? decryptSecret(current!.passwordBox!) : null);
  if (data.user && !password) throw validationError({ password: 'required' });

  const problem = await verifySmtp({
    host: data.host,
    port: data.port,
    security: data.security,
    user: data.user ?? null,
    password,
    from: data.from,
    source: 'portal',
  });
  if (problem) throw new AppError('smtpRejected', { reason: problem });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { name: true },
  });
  const value: StoredEmailSettings = {
    host: data.host,
    port: data.port,
    security: data.security,
    user: data.user ?? null,
    passwordBox: password ? encryptSecret(password) : null,
    from: data.from,
    updatedById: actor.userId,
    updatedByName: user.name,
    updatedAt: now.toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: EMAIL_SETTINGS_KEY },
      create: { key: EMAIL_SETTINGS_KEY, value: value as unknown as Prisma.InputJsonValue },
      update: { value: value as unknown as Prisma.InputJsonValue },
    });
    // Never the password, only whether it changed.
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'settings.email.update',
      entityType: 'SiteSetting',
      entityId: EMAIL_SETTINGS_KEY,
      after: {
        host: data.host,
        port: data.port,
        security: data.security,
        user: data.user ?? null,
        from: data.from,
        passwordChanged: !!data.password,
      },
      meta,
    });
  });
  resetMailerCache();
}

/** Removes the portal settings: email falls back to the server settings (or the log). */
export async function clearEmailSettings(actor: Actor, meta: RequestMeta, now = new Date()) {
  await assertUnlocked(actor, now);
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.deleteMany({ where: { key: EMAIL_SETTINGS_KEY } });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'settings.email.clear',
      entityType: 'SiteSetting',
      entityId: EMAIL_SETTINGS_KEY,
      meta,
    });
  });
  resetMailerCache();
}

const testEmailSchema = z.object({
  to: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().toLowerCase().email('emailInvalid').max(254).optional(),
  ),
});

/**
 * Sends a test email in the normal layout, to the admin's own address or another one (e.g. a
 * spam checker such as mail-tester.com).
 */
export async function sendTestEmail(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const { to } = parseInput(testEmailSchema, input ?? {});
  await enforce(`testmail:user:${actor.userId}`, { limit: 10, windowSeconds: 15 * 60 });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { email: true, name: true },
  });
  const recipient = to ?? user.email;
  try {
    await sendMail(
      renderEmail(recipient, actor.locale, {
        kind: 'settingsTest',
        name: to ? '' : (user.name.split(' ')[0] ?? user.name),
        url: appUrl(actor.locale, '/'),
      }),
      { always: true },
    );
  } catch (error) {
    throw new AppError('smtpRejected', {
      reason: error instanceof Error ? error.message.slice(0, 200) : 'error',
    });
  }
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'settings.email.test',
    entityType: 'SiteSetting',
    entityId: EMAIL_SETTINGS_KEY,
    after: { to: recipient },
    meta,
  });
  return recipient;
}

const sendingSchema = z.object({
  paused: z.preprocess((v) => v === true || v === '1' || v === 'on', z.boolean()),
  // Test addresses, separated by commas, spaces or new lines.
  allow: z.preprocess(
    (v) =>
      typeof v === 'string'
        ? [
            ...new Set(
              v
                .toLowerCase()
                .split(/[\s,;]+/)
                .filter(Boolean),
            ),
          ]
        : (v ?? []),
    z.array(z.string().email('emailInvalid').max(254)).max(50),
  ),
});

/**
 * The pause switch for testing: while paused, email only reaches admins, organisers and the
 * listed test addresses. Not locked (pausing must be quick), but every switch is logged.
 */
export async function setEmailSending(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertAdmin(actor);
  const data = parseInput(sendingSchema, input);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { name: true },
  });
  const before = await loadSendingSettings();
  const value: SendingSettings = {
    paused: data.paused,
    allow: data.allow,
    updatedByName: user.name,
    updatedAt: now.toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: EMAIL_SENDING_KEY },
      create: { key: EMAIL_SENDING_KEY, value: value as unknown as Prisma.InputJsonValue },
      update: { value: value as unknown as Prisma.InputJsonValue },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action:
        data.paused === (before?.paused ?? false)
          ? 'settings.email.allowList'
          : data.paused
            ? 'settings.email.paused'
            : 'settings.email.resumed',
      entityType: 'SiteSetting',
      entityId: EMAIL_SETTINGS_KEY,
      after: { paused: data.paused, allow: data.allow },
      meta,
    });
  });
  resetMailerCache();
}

/** Last unlocks and changes for the page (who and when). */
export async function emailSettingsLog(actor: Actor) {
  assertAdmin(actor);
  return prisma.auditLog.findMany({
    where: { entityType: 'SiteSetting', entityId: EMAIL_SETTINGS_KEY },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      action: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });
}
