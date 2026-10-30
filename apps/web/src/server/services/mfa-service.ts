/**
 * Two-step login (D78): an authenticator app code, or a passkey (D88), after the password.
 * Mandatory for staff (until it's on they act as players), optional for everyone else. Ten
 * one-time recovery codes cover a lost phone; an owner can reset it.
 */
import { prisma } from '@tourneasy/db';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { writeAudit } from '../lib/audit';
import { hashToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { enforce, LIMITS } from '../lib/rate-limit';
import type { RequestMeta } from '../lib/request-meta';
import { canEncrypt, decryptSecret, encryptSecret } from '../lib/secret-box';
import { base32Encode, newTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp';
import { assertOwner } from './permissions';
import { type Actor, revokeAllSessions } from './session-service';

const RECOVERY_CODES = 10;

/** "abcd-efgh-jk" style codes; spaces, dashes and case don't matter when typed. */
function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}
const normaliseRecovery = (code: string) => code.toLowerCase().replace(/[\s-]/g, '');

async function userSecret(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true },
  });
  const secret = user.totpSecretEnc ? decryptSecret(user.totpSecretEnc) : null;
  return { ...user, secret };
}

/** Which second steps someone has: the authenticator app and/or passkeys. */
export async function mfaMethods(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabledAt: true, _count: { select: { passkeys: true } } },
  });
  return { app: !!user?.totpEnabledAt, passkeys: user?._count.passkeys ?? 0 };
}

export async function hasMfa(userId: string): Promise<boolean> {
  const m = await mfaMethods(userId);
  return m.app || m.passkeys > 0;
}

/** The status on the security page. */
export async function mfaStatus(actor: Actor) {
  const [user, codesLeft, passkeys] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { totpEnabledAt: true },
    }),
    prisma.mfaRecoveryCode.count({ where: { userId: actor.userId, usedAt: null } }),
    prisma.passkey.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    }),
  ]);
  return {
    appEnabledAt: user.totpEnabledAt,
    passkeys,
    on: !!user.totpEnabledAt || passkeys.length > 0,
    codesLeft,
    required: actor.mfaSetupRequired,
  };
}

/** The secret to scan, made once and kept until confirmed (a reload shows the same QR). */
export async function mfaSetup(actor: Actor) {
  if (!canEncrypt()) throw new AppError('encryptionUnavailable');
  const user = await userSecret(actor.userId);
  if (user.totpEnabledAt) throw new AppError('forbidden');
  let secret = user.secret;
  if (!secret) {
    secret = newTotpSecret();
    await prisma.user.update({
      where: { id: actor.userId },
      data: { totpSecretEnc: encryptSecret(secret), totpLastStep: null },
    });
  }
  const url = otpauthUrl(secret, user.email);
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  // Grouped in fours, for typing it in by hand.
  return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), qrSvg };
}

export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashToken(normaliseRecovery(c)) })),
    }),
  ]);
  return codes;
}

/**
 * Switches it on with the first code from the app. Returns the recovery codes (shown once).
 * Every other device is signed out, so they log in again with a code.
 */
export async function confirmMfaSetup(
  actor: Actor,
  input: { code?: unknown },
  meta: RequestMeta,
): Promise<string[]> {
  await enforce(`mfa:${actor.userId}`, LIMITS.mfaPerUser);
  const user = await userSecret(actor.userId);
  if (user.totpEnabledAt || !user.secret) throw new AppError('forbidden');
  const step = verifyTotp(user.secret, String(input.code ?? ''), null);
  if (step === null) throw new AppError('mfaInvalid', { fields: { code: 'mfaInvalid' } });
  await prisma.user.update({
    where: { id: actor.userId },
    data: { totpEnabledAt: new Date(), totpLastStep: step },
  });
  const codes = await replaceRecoveryCodes(actor.userId);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'auth.mfa.enable',
    entityType: 'User',
    entityId: actor.userId,
    meta,
  });
  await revokeAllSessions(actor.userId, actor.sessionId);
  return codes;
}

/**
 * Checks a login code: one from the app, or an unused recovery code. Repeated wrong codes
 * hit the rate limit.
 */
export async function checkMfaCode(
  userId: string,
  code: string,
  meta: RequestMeta,
): Promise<{ recoveryUsed: boolean }> {
  await enforce(`mfa:${userId}`, LIMITS.mfaPerUser);
  const user = await userSecret(userId);
  if (!(await hasMfa(userId))) throw new AppError('mfaInvalid');
  const step =
    user.totpEnabledAt && user.secret ? verifyTotp(user.secret, code, user.totpLastStep) : null;
  if (step !== null) {
    // Conditional: two requests with the same code can't both pass.
    const claimed = await prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    if (claimed.count === 1) return { recoveryUsed: false };
    throw new AppError('mfaInvalid', { fields: { code: 'mfaInvalid' } });
  }
  const used = await prisma.mfaRecoveryCode.updateMany({
    where: { userId, codeHash: hashToken(normaliseRecovery(code)), usedAt: null },
    data: { usedAt: new Date() },
  });
  if (used.count === 1) {
    await writeAudit(prisma, {
      actorId: userId,
      action: 'auth.mfa.recoveryUsed',
      entityType: 'User',
      entityId: userId,
      meta,
    });
    return { recoveryUsed: true };
  }
  throw new AppError('mfaInvalid', { fields: { code: 'mfaInvalid' } });
}

/**
 * New recovery codes (the old ones stop working). Needs a current code from the app, or, with
 * passkeys only, the password.
 */
export async function regenerateRecoveryCodes(
  actor: Actor,
  input: { code?: unknown; password?: unknown },
  meta: RequestMeta,
): Promise<string[]> {
  const { app } = await mfaMethods(actor.userId);
  if (app) await checkMfaCode(actor.userId, String(input.code ?? ''), meta);
  else await assertPassword(actor.userId, input.password);
  const codes = await replaceRecoveryCodes(actor.userId);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'auth.mfa.recoveryCodes',
    entityType: 'User',
    entityId: actor.userId,
    meta,
  });
  return codes;
}

/** The password again, for changes to two-step login. */
export async function assertPassword(userId: string, password: unknown) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, String(password ?? ''))))
    throw new AppError('wrongPassword', { fields: { password: 'wrongPassword' } });
}

/** With no second step left, the recovery codes go too. */
export async function dropRecoveryCodesIfNoMethod(userId: string) {
  if (!(await hasMfa(userId))) await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
}

function clearMfa(userId: string) {
  return prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    }),
    prisma.passkey.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);
}

/**
 * Turns the authenticator app off, with password and a code. Passkeys stay. Without any second
 * step left, staff act as players until they set one up again (a new phone, say).
 */
export async function disableMfa(
  actor: Actor,
  input: { password?: unknown; code?: unknown },
  meta: RequestMeta,
): Promise<void> {
  await assertPassword(actor.userId, input.password);
  await checkMfaCode(actor.userId, String(input.code ?? ''), meta);
  await prisma.user.update({
    where: { id: actor.userId },
    data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
  });
  await dropRecoveryCodesIfNoMethod(actor.userId);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'auth.mfa.disable',
    entityType: 'User',
    entityId: actor.userId,
    meta,
  });
}

/**
 * Someone lost their phone and recovery codes: the next login asks them to set it up again.
 * All their devices are signed out.
 */
export async function resetUserMfa(actor: Actor, userId: string, meta: RequestMeta) {
  // Owners only (D80): "I lost my phone" is a classic trick on helpful admins.
  assertOwner(actor);
  if (userId === actor.userId) throw new AppError('forbidden');
  await clearMfa(userId);
  await revokeAllSessions(userId);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'auth.mfa.reset',
    entityType: 'User',
    entityId: userId,
    meta,
  });
}
