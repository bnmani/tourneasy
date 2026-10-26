/**
 * Two-step login (D78): an authenticator app code after the password. Mandatory for admins and
 * owners (until it's on they act as players), optional for everyone else. Ten one-time recovery
 * codes cover a lost phone; an owner (or, for players and organisers, an admin) can reset it.
 */
import { prisma, Role } from '@tourneasy/db';
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
import { assertAdmin, assertNotHiddenOwner, isOwner } from './permissions';
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

export async function hasMfa(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabledAt: true },
  });
  return !!user?.totpEnabledAt;
}

/** The status on the security page. */
export async function mfaStatus(actor: Actor) {
  const [user, codesLeft] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { totpEnabledAt: true },
    }),
    prisma.mfaRecoveryCode.count({ where: { userId: actor.userId, usedAt: null } }),
  ]);
  return { enabledAt: user.totpEnabledAt, codesLeft, required: actor.mfaSetupRequired };
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

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
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
  if (!user.totpEnabledAt || !user.secret) throw new AppError('mfaInvalid');
  const step = verifyTotp(user.secret, code, user.totpLastStep);
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

/** New recovery codes (the old ones stop working); needs a current code from the app. */
export async function regenerateRecoveryCodes(
  actor: Actor,
  input: { code?: unknown },
  meta: RequestMeta,
): Promise<string[]> {
  await checkMfaCode(actor.userId, String(input.code ?? ''), meta);
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

function clearMfa(userId: string) {
  return prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);
}

/**
 * Switches it off with password and a code. Admins and owners may, but then act as players
 * until they set it up again (a new phone, say).
 */
export async function disableMfa(
  actor: Actor,
  input: { password?: unknown; code?: unknown },
  meta: RequestMeta,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { passwordHash: true },
  });
  const password = String(input.password ?? '');
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password)))
    throw new AppError('wrongPassword', { fields: { password: 'wrongPassword' } });
  await checkMfaCode(actor.userId, String(input.code ?? ''), meta);
  await clearMfa(actor.userId);
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
 * Owners reset anyone; admins only players and organisers. All their devices are signed out.
 */
export async function resetUserMfa(actor: Actor, userId: string, meta: RequestMeta) {
  assertAdmin(actor);
  if (userId === actor.userId) throw new AppError('forbidden');
  await assertNotHiddenOwner(actor, userId);
  if (!isOwner(actor)) {
    const staff = await prisma.userRole.count({
      where: { userId, role: { in: [Role.ADMIN, Role.OWNER] } },
    });
    if (staff) throw new AppError('forbidden');
  }
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
