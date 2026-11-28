/**
 * Umpire profiles: an organiser makes a profile per umpire for a tournament day; the umpire
 * signs in on one phone with a 6-digit PIN or a QR link. Plain PIN and QR are returned once
 * and never stored or logged.
 *
 * Hashing: the PIN uses scrypt with a random salt (slow, since a PIN has few combinations).
 * The QR token is 256 bits of randomness, so it uses HMAC-SHA256 keyed with
 * UMPIRE_TOKEN_SECRET: deterministic, so `qrTokenHash` can be unique and looked up directly.
 * Without the secret nothing works (fail closed).
 *
 * The session token is stateless and signed (umpire, expiry, device and a stamp of the
 * current credentials), and is checked against the profile on every use, so revoking,
 * resetting or expiring a profile ends the session at once.
 */
import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  type ScryptOptions,
  timingSafeEqual,
} from 'node:crypto';
import { prisma } from '@tourneasy/db';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { randomToken } from '../lib/crypto';
import { AppError, validationError } from '../lib/errors';
import { enforce, LIMITS } from '../lib/rate-limit';
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

function scryptAsync(pin: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, 32, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt, SCRYPT);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [kind, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scryptAsync(pin, Buffer.from(salt, 'base64url'), SCRYPT);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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

const isActive = (u: { revokedAt: Date | null; expiresAt: Date }, now = new Date()) =>
  u.revokedAt === null && u.expiresAt > now;

/** A new 6-digit PIN that no currently active umpire uses, so a PIN alone finds one profile. */
async function freshPin(): Promise<string> {
  const active = await prisma.umpire.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    select: { pinHash: true },
  });
  for (let attempt = 0; attempt < 20; attempt++) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const taken = await Promise.all(active.map((u) => verifyPin(pin, u.pinHash)));
    if (!taken.includes(true)) return pin;
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

  const pin = await freshPin();
  const { qrToken, qrTokenHash } = credentials();
  const umpire = await prisma.umpire.create({
    data: {
      tournamentId: data.tournamentId,
      displayName: data.displayName,
      pinHash: await hashPin(pin),
      qrTokenHash,
      expiresAt: endOfDay(tournament.endsOn),
    },
  });
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
  const pin = await freshPin();
  const { qrToken, qrTokenHash } = credentials();
  await prisma.umpire.update({
    where: { id: umpire.id },
    data: { pinHash: await hashPin(pin), qrTokenHash, deviceId: null },
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
  if (meta.ip) await enforce(`umpire-sign-in:ip:${meta.ip}`, LIMITS.umpireSignInPerIp);
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) throw new AppError('invalidCredentials');

  let found: Awaited<ReturnType<typeof prisma.umpire.findFirst>> = null;
  if ('qrToken' in parsed.data) {
    const candidate = await prisma.umpire.findUnique({
      where: { qrTokenHash: hmac('qr', parsed.data.qrToken) },
    });
    if (candidate && isActive(candidate)) found = candidate;
  } else {
    const pin = parsed.data.pin;
    const active = await prisma.umpire.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    });
    const matches = await Promise.all(active.map((u) => verifyPin(pin, u.pinHash)));
    found = active.find((_, i) => matches[i]) ?? null;
  }
  if (!found) throw new AppError('invalidCredentials');

  // Claim the profile for this phone only if it is free or already this phone, in one step.
  const claimed = await prisma.umpire.updateMany({
    where: {
      id: found.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      OR: [{ deviceId: null }, { deviceId }],
    },
    data: { deviceId },
  });
  if (claimed.count === 0) {
    const now = await prisma.umpire.findUnique({ where: { id: found.id } });
    if (now && isActive(now) && now.deviceId !== deviceId) throw new AppError('deviceBound');
    throw new AppError('invalidCredentials');
  }
  await writeAudit(prisma, {
    actorId: null,
    action: 'umpire.sign-in',
    entityType: 'Umpire',
    entityId: found.id,
    meta,
  });
  return {
    umpireId: found.id,
    expiresAt: found.expiresAt,
    sessionToken: sign({
      umpireId: found.id,
      exp: found.expiresAt.getTime(),
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
    expiresAt: umpire.expiresAt,
  };
}
