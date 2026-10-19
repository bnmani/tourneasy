/**
 * Login sessions for web (opaque cookie) and mobile (JWT access token + rotating refresh
 * token). Every login is a UserSession row, so users can list and revoke devices and
 * revocation is immediate on both platforms (DECISIONS.md D3).
 */
import { prisma, type Role, SessionKind } from '@tourneasy/db';
import { jwtVerify, SignJWT } from 'jose';
import { hashToken, randomToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { LIMITS, enforce } from '../lib/rate-limit';
import { describeUserAgent, type RequestMeta } from '../lib/request-meta';

const DAY = 24 * 60 * 60 * 1000;
export const WEB_SESSION_TTL_MS = 30 * DAY; // "remember me"
export const WEB_SHORT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // browser-session cookie
export const MOBILE_SESSION_TTL_MS = 90 * DAY;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** The authenticated caller, passed explicitly into every service function. */
export type Actor = {
  userId: string;
  sessionId: string;
  roles: Role[];
  name: string;
  locale: 'nl' | 'en';
  emailVerified: boolean;
};

function toActor(
  sessionId: string,
  user: {
    id: string;
    name: string;
    locale: 'nl' | 'en';
    emailVerifiedAt: Date | null;
    roles: { role: Role }[];
  },
): Actor {
  return {
    userId: user.id,
    sessionId,
    roles: user.roles.map((r) => r.role),
    name: user.name,
    locale: user.locale,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

const activeUserFilter = { isActive: true, deletedAt: null, anonymisedAt: null } as const;

// ── Web ────────────────────────────────────────────────────────────────────────────

export async function createWebSession(
  userId: string,
  meta: RequestMeta,
  rememberMe: boolean,
): Promise<{ token: string; expiresAt: Date; persistent: boolean }> {
  const token = randomToken();
  const expiresAt = new Date(
    Date.now() + (rememberMe ? WEB_SESSION_TTL_MS : WEB_SHORT_SESSION_TTL_MS),
  );
  await prisma.userSession.create({
    data: {
      userId,
      kind: SessionKind.WEB,
      tokenHash: hashToken(token),
      deviceName: describeUserAgent(meta.userAgent),
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
      expiresAt,
    },
  });
  return { token, expiresAt, persistent: rememberMe };
}

/** Resolves a session cookie to an Actor, or null if unknown, revoked or expired. */
export async function actorFromWebToken(token: string): Promise<Actor | null> {
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: true } } },
  });
  const now = Date.now();
  if (
    !session ||
    session.kind !== SessionKind.WEB ||
    session.revokedAt ||
    session.expiresAt.getTime() <= now ||
    !session.user.isActive ||
    session.user.deletedAt ||
    session.user.anonymisedAt
  ) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return toActor(session.id, session.user);
}

// ── Mobile ─────────────────────────────────────────────────────────────────────────

function jwtKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set (≥ 32 characters) to issue mobile access tokens.');
  }
  return new TextEncoder().encode(secret);
}

const JWT_ISSUER = 'tourneasy';
const JWT_AUDIENCE = 'tourneasy-api';

export type TokenPair = {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
};

async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(jwtKey());
}

export async function createMobileSession(
  userId: string,
  meta: RequestMeta,
  deviceName?: string,
): Promise<TokenPair> {
  const refreshToken = randomToken();
  const now = Date.now();
  const session = await prisma.userSession.create({
    data: {
      userId,
      kind: SessionKind.MOBILE,
      deviceName: deviceName?.slice(0, 80) || describeUserAgent(meta.userAgent),
      userAgent: meta.userAgent,
      ipAddress: meta.ip,
      expiresAt: new Date(now + MOBILE_SESSION_TTL_MS),
      refreshTokens: {
        create: {
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(now + MOBILE_SESSION_TTL_MS),
        },
      },
    },
  });
  return {
    tokenType: 'Bearer',
    accessToken: await signAccessToken(userId, session.id),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
  };
}

/**
 * Rotates a refresh token. Presenting an already-rotated token means it was stolen or
 * replayed, so the whole session is revoked (token-family reuse detection).
 */
export async function refreshMobileSession(refreshToken: string): Promise<TokenPair> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { session: true },
  });
  if (!stored) throw new AppError('tokenInvalid');

  await enforce(`refresh:session:${stored.sessionId}`, LIMITS.refreshPerSession);

  const { session } = stored;
  if (stored.rotatedAt) {
    await revokeSessionById(session.id);
    throw new AppError('tokenInvalid');
  }
  const now = Date.now();
  if (
    session.revokedAt ||
    session.expiresAt.getTime() <= now ||
    stored.expiresAt.getTime() <= now
  ) {
    throw new AppError('tokenInvalid');
  }

  const next = randomToken();
  await prisma.$transaction(async (tx) => {
    // Conditional update guards against two concurrent refreshes with the same token.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, rotatedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppError('tokenInvalid');
    const created = await tx.refreshToken.create({
      data: { sessionId: session.id, tokenHash: hashToken(next), expiresAt: session.expiresAt },
    });
    await tx.refreshToken.update({ where: { id: stored.id }, data: { replacedById: created.id } });
    await tx.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  });

  return {
    tokenType: 'Bearer',
    accessToken: await signAccessToken(session.userId, session.id),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: next,
  };
}

/** Verifies a Bearer access token and that its session is still active. */
export async function actorFromAccessToken(token: string): Promise<Actor | null> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwtKey(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
    }));
  } catch {
    return null;
  }
  const sessionId = typeof payload.sid === 'string' ? payload.sid : null;
  if (!sessionId || !payload.sub) return null;
  const session = await prisma.userSession.findFirst({
    where: {
      id: sessionId,
      userId: payload.sub,
      kind: SessionKind.MOBILE,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: activeUserFilter,
    },
    include: { user: { include: { roles: true } } },
  });
  return session ? toActor(session.id, session.user) : null;
}

// ── Device management ──────────────────────────────────────────────────────────────

export async function revokeSessionById(sessionId: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listSessions(actor: Actor) {
  const sessions = await prisma.userSession.findMany({
    where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      kind: true,
      deviceName: true,
      ipAddress: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });
  return sessions.map((s) => ({ ...s, current: s.id === actor.sessionId }));
}

export async function revokeSession(actor: Actor, sessionId: string): Promise<void> {
  const result = await prisma.userSession.updateMany({
    where: { id: sessionId, userId: actor.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new AppError('notFound');
}

/** Logs out every device except `keepSessionId` (or all when omitted). */
export async function revokeAllSessions(userId: string, keepSessionId?: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
