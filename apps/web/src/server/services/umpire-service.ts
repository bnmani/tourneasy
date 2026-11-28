/**
 * Umpire profiles: an organiser makes a profile per umpire for a tournament day; the umpire
 * signs in on one phone with a 6-digit PIN or a QR link. Plain PIN and QR are returned once
 * and never stored or logged.
 *
 * Hashing: both the PIN and the QR token are stored as HMAC-SHA256 keyed with
 * UMPIRE_TOKEN_SECRET: deterministic, so `pinHash` and `qrTokenHash` are unique and a sign-in is
 * one indexed lookup. A PIN has only 10^6 values, so guessing is stopped by rate limits (per
 * address and, for failed PINs, global), not by a slow hash. Without the secret nothing works.
 *
 * The session token is stateless and signed (umpire, expiry, device and a stamp of the
 * current credentials), and is checked against the profile on every use, so revoking,
 * resetting or expiring a profile ends the session at once.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Prisma, prisma } from '@tourneasy/db';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { randomToken } from '../lib/crypto';
import { AppError, validationError } from '../lib/errors';
import { enforce, hit, isExhausted, LIMITS } from '../lib/rate-limit';
import type { RequestMeta } from '../lib/request-meta';
import { siteUrl } from '../lib/urls';
import { parseInput } from '../lib/validation';
import { assertCanManageTournament } from './permissions';
import type { Actor } from './session-service';

/** The venue has no time zone field yet, and every venue is in the Netherlands. */
const VENUE_TIME_ZONE = 'Europe/Amsterdam';

const createSchema = z.object({
  tournamentId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(60),
});

function secret(): string {
  const value = process.env.UMPIRE_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error('UMPIRE_TOKEN_SECRET is missing or too short');
  return value;
}

function hmac(purpose: string, value: string): string {
  return createHmac('sha256', secret()).update(`${purpose}:${value}`).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Offset (ms) of a time zone from UTC at an instant. */
function zoneOffset(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local - Math.floor(at / 1000) * 1000;
}

/** The first instant after the given calendar day (a UTC-midnight date) in the time zone. */
export function endOfDay(day: Date, timeZone = VENUE_TIME_ZONE): Date {
  const nextMidnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
  let result = nextMidnight - zoneOffset(nextMidnight, timeZone);
  result = nextMidnight - zoneOffset(result, timeZone);
  return new Date(result);
}

/** The first instant after today (the calendar day it is now in the time zone). */
function endOfToday(now: Date, timeZone = VENUE_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return endOfDay(new Date(Date.UTC(get('year'), get('month') - 1, get('day'))), timeZone);
}

const isActive = (u: { revokedAt: Date | null; expiresAt: Date }, now = new Date()) =>
  u.revokedAt === null && u.expiresAt > now;

/**
 * Writes with a new 6-digit PIN. A PIN already held by another profile (active or not) is
 * refused by the unique `pinHash`, and a new one is tried, so a PIN alone finds one profile.
 */
async function withFreshPin<T>(write: (pin: string, pinHash: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      return await write(pin, hmac('pin', pin));
    } catch (error) {
      const taken =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        JSON.stringify(error.meta?.target ?? '').includes('pinHash');
      if (!taken) throw error;
    }
  }
  throw new AppError('unexpected');
}

function credentials() {
  const qrToken = randomToken(32);
  return { qrToken, qrTokenHash: hmac('qr', qrToken) };
}

const qrUrlFor = (qrToken: string) =>
  siteUrl(`/umpire/sign-in?token=${encodeURIComponent(qrToken)}`);

export async function createUmpire(
  actor: Actor | null,
  input: { tournamentId: string; displayName: string },
  meta: RequestMeta,
): Promise<{ pin: string; qrUrl: string }> {
  secret();
  const data = parseInput(createSchema, input);
  await assertCanManageTournament(actor, data.tournamentId);
  const tournament = await prisma.tournament.findUnique({
    where: { id: data.tournamentId },
    select: { endsOn: true },
  });
  if (!tournament) throw new AppError('notFound');

  const { qrToken, qrTokenHash } = credentials();
  const { pin, umpire } = await withFreshPin(async (pin, pinHash) => ({
    pin,
    umpire: await prisma.umpire.create({
      data: {
        tournamentId: data.tournamentId,
        displayName: data.displayName,
        pinHash,
        qrTokenHash,
        expiresAt: endOfDay(tournament.endsOn),
      },
    }),
  }));
  await writeAudit(prisma, {
    actorId: actor!.userId,
    action: 'umpire.create',
    entityType: 'Umpire',
    entityId: umpire.id,
    after: { tournamentId: data.tournamentId, displayName: data.displayName },
    meta,
  });
  return { pin, qrUrl: qrUrlFor(qrToken) };
}

async function manageable(actor: Actor | null, umpireId: string) {
  const umpire = z.string().uuid().safeParse(umpireId).success
    ? await prisma.umpire.findUnique({ where: { id: umpireId } })
    : null;
  if (!umpire) {
    if (!actor) throw new AppError('unauthorized');
    throw new AppError('notFound');
  }
  await assertCanManageTournament(actor, umpire.tournamentId);
  return umpire;
}

export async function revokeUmpire(
  actor: Actor | null,
  umpireId: string,
  meta: RequestMeta,
): Promise<void> {
  const umpire = await manageable(actor, umpireId);
  if (umpire.revokedAt) return;
  await prisma.umpire.update({ where: { id: umpire.id }, data: { revokedAt: new Date() } });
  await writeAudit(prisma, {
    actorId: actor!.userId,
    action: 'umpire.revoke',
    entityType: 'Umpire',
    entityId: umpire.id,
    meta,
  });
}

/** New PIN and QR for a lost or stolen phone: the old ones stop working and the device is freed. */
export async function resetUmpireAccess(
  actor: Actor | null,
  umpireId: string,
  meta: RequestMeta,
): Promise<{ pin: string; qrUrl: string }> {
  secret();
  const umpire = await manageable(actor, umpireId);
  if (umpire.revokedAt) throw new AppError('notFound');
  const { qrToken, qrTokenHash } = credentials();
  const pin = await withFreshPin(async (pin, pinHash) => {
    await prisma.umpire.update({
      where: { id: umpire.id },
      data: { pinHash, qrTokenHash, deviceId: null },
    });
    return pin;
  });
  await writeAudit(prisma, {
    actorId: actor!.userId,
    action: 'umpire.reset',
    entityType: 'Umpire',
    entityId: umpire.id,
    meta,
  });
  return { pin, qrUrl: qrUrlFor(qrToken) };
}

const FAILED_PIN_KEY = 'umpire-failed-pin:global';

const signInSchema = z.union([
  z.object({ pin: z.string().regex(/^\d{6}$/) }),
  z.object({ qrToken: z.string().min(16).max(200) }),
]);

type SessionClaims = { umpireId: string; exp: number; deviceId: string; stamp: string };

function sign(claims: SessionClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${hmac('session', body)}`;
}

/** Stamp of the current credentials: a reset changes it and so ends older sessions. */
const stampOf = (qrTokenHash: string) => hmac('stamp', qrTokenHash).slice(0, 16);

export async function signInUmpire(
  input: { pin: string } | { qrToken: string },
  deviceId: string,
  meta: RequestMeta = {},
): Promise<{ umpireId: string; sessionToken: string; expiresAt: Date }> {
  secret();
  if (!deviceId || deviceId.length > 200) throw validationError({ deviceId: 'required' });
  // Fail closed: without an address all callers share the 'unknown' bucket, still limited.
  await enforce(`umpire-sign-in:ip:${meta.ip ?? 'unknown'}`, LIMITS.umpireSignInPerIp);
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) throw new AppError('invalidCredentials');

  const byPin = 'pin' in parsed.data;
  if (byPin && (await isExhausted(FAILED_PIN_KEY, LIMITS.umpireFailedPinGlobal))) {
    throw new AppError('rateLimited', {
      retryAfterSeconds: LIMITS.umpireFailedPinGlobal.windowSeconds,
    });
  }
  const candidate = await prisma.umpire.findUnique({
    where:
      'pin' in parsed.data
        ? { pinHash: hmac('pin', parsed.data.pin) }
        : { qrTokenHash: hmac('qr', parsed.data.qrToken) },
  });

  // Claim the profile for this phone only if it is free or already this phone, in one step.
  // Wrong credentials, ended profiles and a profile held by another phone all answer the same,
  // so a caller can't tell which PINs belong to a profile.
  const claimed = candidate
    ? await prisma.umpire.updateMany({
        where: {
          id: candidate.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          OR: [{ deviceId: null }, { deviceId }],
        },
        data: { deviceId },
      })
    : { count: 0 };
  if (!candidate || claimed.count === 0) {
    if (byPin) await hit(FAILED_PIN_KEY, LIMITS.umpireFailedPinGlobal);
    throw new AppError('invalidCredentials');
  }
  const found = candidate;
  await writeAudit(prisma, {
    actorId: null,
    action: 'umpire.sign-in',
    entityType: 'Umpire',
    entityId: found.id,
    meta,
  });
  // A session ends with the day it was started on, or sooner if the profile ends sooner.
  const expiresAt = new Date(Math.min(found.expiresAt.getTime(), endOfToday(new Date()).getTime()));
  return {
    umpireId: found.id,
    expiresAt,
    sessionToken: sign({
      umpireId: found.id,
      exp: expiresAt.getTime(),
      deviceId,
      stamp: stampOf(found.qrTokenHash),
    }),
  };
}

/** Checks a session token on a request: signed, this phone, not expired, not revoked, not reset. */
export async function verifyUmpireSession(
  token: string,
  deviceId: string,
): Promise<{ umpireId: string; tournamentId: string; displayName: string; expiresAt: Date }> {
  const [body, mac] = token.split('.');
  if (!body || !mac || !safeEqual(mac, hmac('session', body))) throw new AppError('unauthorized');
  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    throw new AppError('unauthorized');
  }
  if (claims.deviceId !== deviceId || claims.exp <= Date.now()) throw new AppError('unauthorized');
  const umpire = await prisma.umpire.findUnique({ where: { id: claims.umpireId } });
  if (
    !umpire ||
    !isActive(umpire) ||
    umpire.deviceId !== deviceId ||
    !safeEqual(claims.stamp, stampOf(umpire.qrTokenHash))
  ) {
    throw new AppError('unauthorized');
  }
  return {
    umpireId: umpire.id,
    tournamentId: umpire.tournamentId,
    displayName: umpire.displayName,
    expiresAt: new Date(Math.min(umpire.expiresAt.getTime(), claims.exp)),
  };
}
