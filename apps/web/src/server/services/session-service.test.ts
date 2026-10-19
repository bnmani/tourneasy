import { prisma } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { AppError } from '../lib/errors';
import {
  actorFromAccessToken,
  actorFromWebToken,
  createMobileSession,
  createWebSession,
  listSessions,
  refreshMobileSession,
  revokeSession,
} from './session-service';

beforeEach(resetDatabase);

describe('web sessions', () => {
  it('resolves a valid cookie and stores only its hash', async () => {
    const { userId } = await createPlayer();
    const { token } = await createWebSession(userId, meta, true);
    const actor = await actorFromWebToken(token);
    expect(actor).toMatchObject({ userId, roles: ['PLAYER'], emailVerified: false, locale: 'nl' });

    const stored = await prisma.userSession.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.deviceName).toBe('Chrome · macOS');
  });

  it('rejects unknown, revoked and expired sessions', async () => {
    const { userId } = await createPlayer();
    expect(await actorFromWebToken('not-a-real-token')).toBeNull();

    const a = await createWebSession(userId, meta, true);
    const actor = (await actorFromWebToken(a.token))!;
    await revokeSession(actor, actor.sessionId);
    expect(await actorFromWebToken(a.token)).toBeNull();

    const b = await createWebSession(userId, meta, false);
    await prisma.userSession.updateMany({
      where: { revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(await actorFromWebToken(b.token)).toBeNull();
  });

  it('lists only my active sessions and marks the current one', async () => {
    const { userId } = await createPlayer();
    const other = await createPlayer();
    const mine = await createWebSession(userId, meta, true);
    await createWebSession(userId, meta, true);
    await createWebSession(other.userId, meta, true);
    const actor = (await actorFromWebToken(mine.token))!;

    const sessions = await listSessions(actor);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);

    // Can't revoke someone else's session.
    const foreign = await prisma.userSession.findFirstOrThrow({ where: { userId: other.userId } });
    await expect(revokeSession(actor, foreign.id)).rejects.toBeInstanceOf(AppError);
  });
});

describe('mobile tokens', () => {
  it('issues a working access token', async () => {
    const { userId } = await createPlayer();
    const pair = await createMobileSession(userId, meta, 'Pixel 9');
    expect(pair.tokenType).toBe('Bearer');
    expect((await actorFromAccessToken(pair.accessToken))?.userId).toBe(userId);
    expect(await actorFromAccessToken(`${pair.accessToken}x`)).toBeNull();
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const { userId } = await createPlayer();
    const first = await createMobileSession(userId, meta);
    const second = await refreshMobileSession(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await actorFromAccessToken(second.accessToken))?.userId).toBe(userId);

    // Replaying the rotated token = theft signal: whole session is revoked.
    await expect(refreshMobileSession(first.refreshToken)).rejects.toMatchObject({
      code: 'tokenInvalid',
    });
    await expect(refreshMobileSession(second.refreshToken)).rejects.toMatchObject({
      code: 'tokenInvalid',
    });
    expect(await actorFromAccessToken(second.accessToken)).toBeNull();
  });
});
