/**
 * Stripe keys managed in the portal (D54). The page is locked: an admin unlocks it for
 * 10 minutes by re-entering their password (per session, rate limited, audited). Secret keys
 * are encrypted at rest and never shown again, only their last four characters. Every change is
 * in the audit log; the page shows who changed it last.
 */
import { prisma, type Prisma } from '@tourneasy/db';
import { paymentSettingsSchema, unlockSchema } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { enforce, LIMITS } from '../lib/rate-limit';
import type { RequestMeta } from '../lib/request-meta';
import { canEncrypt, decryptSecret, encryptSecret } from '../lib/secret-box';
import { parseInput } from '../lib/validation';
import {
  loadStripeConfig,
  resetGatewayCache,
  STRIPE_SETTINGS_KEY,
  verifyStripeSecretKey,
  type StoredStripeSettings,
} from '../payments/gateway';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';

export const UNLOCK_MINUTES = 10;

async function elevatedUntil(actor: Actor, now: Date): Promise<Date | null> {
  const session = await prisma.userSession.findUnique({
    where: { id: actor.sessionId },
    select: { elevatedUntil: true, revokedAt: true },
  });
  const until = session?.elevatedUntil;
  return until && !session.revokedAt && until > now ? until : null;
}

async function stored(): Promise<StoredStripeSettings | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: STRIPE_SETTINGS_KEY } });
  return (row?.value as StoredStripeSettings | undefined) ?? null;
}

const modeOf = (key: string) => (/_live_/.test(key) ? 'live' : 'test');

/** What the settings page shows: status and masked values only, never a secret. */
export async function getPaymentSettings(actor: Actor, now = new Date()) {
  assertAdmin(actor);
  const [settings, config, until] = await Promise.all([
    stored(),
    loadStripeConfig(),
    elevatedUntil(actor, now),
  ]);
  return {
    unlockedUntil: until,
    canEncrypt: canEncrypt(),
    active: config !== null,
    source: config?.source ?? null,
    mode: config ? modeOf(config.secretKey) : null,
    webhookConfigured: !!config?.webhookSecret,
    unreadable: !!settings && !decryptSecret(settings.secretKeyBox),
    stored: settings && {
      publishableKey: settings.publishableKey,
      secretKeyLast4: settings.secretKeyLast4,
      webhookSet: !!settings.webhookSecretBox,
      updatedAt: new Date(settings.updatedAt),
      updatedByName: settings.updatedByName,
    },
  };
}

/** Re-enter the password to unlock the payment settings for 10 minutes. */
export async function unlockSettings(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  assertAdmin(actor);
  const { password } = parseInput(unlockSchema, input);
  await enforce(`unlock:user:${actor.userId}`, LIMITS.unlockPerUser);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { passwordHash: true },
  });
  const ok = !!user.passwordHash && (await verifyPassword(user.passwordHash, password));
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: ok ? 'settings.unlock' : 'settings.unlockFailed',
    entityType: 'SiteSetting',
    entityId: STRIPE_SETTINGS_KEY,
    meta,
  });
  if (!ok) throw new AppError('wrongPassword', { fields: { password: 'wrongPassword' } });
  const until = new Date(now.getTime() + UNLOCK_MINUTES * 60_000);
  await prisma.userSession.update({
    where: { id: actor.sessionId },
    data: { elevatedUntil: until },
  });
  return until;
}

export async function lockSettings(actor: Actor) {
  assertAdmin(actor);
  await prisma.userSession.update({
    where: { id: actor.sessionId },
    data: { elevatedUntil: null },
  });
}

async function assertUnlocked(actor: Actor, now: Date) {
  assertAdmin(actor);
  if (!(await elevatedUntil(actor, now))) throw new AppError('settingsLocked');
}

/** Saves new Stripe keys (empty fields keep the stored ones); the secret key is checked with Stripe. */
export async function savePaymentSettings(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  await assertUnlocked(actor, now);
  if (!canEncrypt()) throw new AppError('encryptionUnavailable');
  const data = parseInput(paymentSettingsSchema, input);
  const current = await stored();
  const currentSecret = current ? decryptSecret(current.secretKeyBox) : null;
  const secretKey = data.secretKey ?? currentSecret;
  const publishableKey = data.publishableKey ?? current?.publishableKey;
  const errors: Record<string, string> = {};
  if (!secretKey) errors.secretKey = 'required';
  if (!publishableKey) errors.publishableKey = 'required';
  if (secretKey && publishableKey && modeOf(secretKey) !== modeOf(publishableKey))
    errors.publishableKey = 'stripeModeMismatch';
  if (Object.keys(errors).length > 0) throw validationError(errors);
  if (data.secretKey && !(await verifyStripeSecretKey(data.secretKey)))
    throw validationError({ secretKey: 'stripeKeyRejected' });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { name: true },
  });
  const value: StoredStripeSettings = {
    publishableKey: publishableKey!,
    secretKeyBox: data.secretKey ? encryptSecret(data.secretKey) : current!.secretKeyBox,
    secretKeyLast4: secretKey!.slice(-4),
    webhookSecretBox: data.webhookSecret
      ? encryptSecret(data.webhookSecret)
      : (current?.webhookSecretBox ?? null),
    updatedById: actor.userId,
    updatedByName: user.name,
    updatedAt: now.toISOString(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: STRIPE_SETTINGS_KEY },
      create: { key: STRIPE_SETTINGS_KEY, value: value as unknown as Prisma.InputJsonValue },
      update: { value: value as unknown as Prisma.InputJsonValue },
    });
    // Which keys changed, never their values.
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'settings.payments.update',
      entityType: 'SiteSetting',
      entityId: STRIPE_SETTINGS_KEY,
      after: {
        mode: modeOf(secretKey!),
        changed: Object.entries(data)
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k),
      },
      meta,
    });
  });
  resetGatewayCache();
}

/** Removes the portal keys: online payment goes off (unless STRIPE_* env vars are set). */
export async function clearPaymentSettings(actor: Actor, meta: RequestMeta, now = new Date()) {
  await assertUnlocked(actor, now);
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.deleteMany({ where: { key: STRIPE_SETTINGS_KEY } });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'settings.payments.clear',
      entityType: 'SiteSetting',
      entityId: STRIPE_SETTINGS_KEY,
      meta,
    });
  });
  resetGatewayCache();
}

/** Last changes for the settings page (who and when). */
export async function paymentSettingsLog(actor: Actor) {
  assertAdmin(actor);
  return prisma.auditLog.findMany({
    where: { entityType: 'SiteSetting', entityId: STRIPE_SETTINGS_KEY },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      action: true,
      createdAt: true,
      actor: { select: { name: true, email: true } },
    },
  });
}
