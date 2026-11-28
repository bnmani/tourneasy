import { prisma } from '@tourneasy/db';
import { AppError } from './errors';

export type RateLimit = { limit: number; windowSeconds: number };

export const LIMITS = {
  loginPerIp: { limit: 30, windowSeconds: 15 * 60 },
  // Per account and address: someone elsewhere can't lock you out (D84).
  loginPerIdentifierIp: { limit: 8, windowSeconds: 15 * 60 },
  // Per account from all addresses: only against attacks spread over many addresses.
  loginPerIdentifier: { limit: 100, windowSeconds: 60 * 60 },
  signUpPerIp: { limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerIp: { limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerEmail: { limit: 3, windowSeconds: 60 * 60 },
  verifyResendPerUser: { limit: 5, windowSeconds: 60 * 60 },
  refreshPerSession: { limit: 60, windowSeconds: 15 * 60 },
  unlockPerUser: { limit: 5, windowSeconds: 15 * 60 },
  mfaPerUser: { limit: 10, windowSeconds: 15 * 60 },
  // Partner invites send email to any address: keep that from being used for spam.
  partnerInvitePerUser: { limit: 20, windowSeconds: 24 * 60 * 60 },
  partnerInvitePerAddress: { limit: 3, windowSeconds: 24 * 60 * 60 },
  // Organisers find players to enter; enough for a busy day, too few to list everyone.
  entrySearchPerUser: { limit: 300, windowSeconds: 15 * 60 },
  // Umpire PIN sign-in: a 6-digit PIN must not be guessable by trying them all.
  umpireSignInPerIp: { limit: 20, windowSeconds: 15 * 60 },
  // Failed umpire PINs from all addresses together: 6 digits are few, so an attacker spreading
  // over many addresses is stopped here. 30 per 15 min allows a busy desk's typos (many umpires
  // signing in at once rarely fail more than a few times) but caps guessing at about 2,900 a day.
  // While tripped PIN sign-in is closed for everyone; the QR link still works.
  umpireFailedPinGlobal: { limit: 30, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimit>;

/**
 * Fixed-window counter in Postgres (atomic upsert), so limits hold across app instances
 * and restarts. Returns whether this hit is still within the limit.
 */
export async function hit(
  key: string,
  { limit, windowSeconds }: RateLimit,
  now = new Date(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;

  // Prune expired windows now and then instead of running a separate job.
  if (Math.random() < 0.01) {
    await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  const count = rows[0]?.count ?? 1;
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
  };
}

/**
 * Gives back one hit counted at `now` (same window), e.g. when the attempt turned out fine.
 * Never goes below zero.
 */
export async function refund(key: string, { windowSeconds }: RateLimit, now: Date): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  await prisma.$executeRaw`
    UPDATE "RateLimitBucket" SET "count" = "count" - 1
    WHERE "key" = ${key} AND "windowStart" = ${windowStart} AND "count" > 0`;
}

export async function enforce(key: string, rule: RateLimit): Promise<void> {
  const result = await hit(key, rule);
  if (!result.allowed) {
    throw new AppError('rateLimited', { retryAfterSeconds: result.retryAfterSeconds });
  }
}
