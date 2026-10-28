import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { currentStep, totpCode } from '../lib/totp';
import { listAuditLog } from './admin-service';
import { getEmailSettings } from './email-settings-service';
import { checkMfaCode, confirmMfaSetup, disableMfa, mfaSetup, resetUserMfa } from './mfa-service';
import { getPaymentSettings } from './payment-settings-service';
import { grantRole, listUsers, revokeRole } from './role-service';
import {
  actorFromWebToken,
  completeMfaSession,
  createWebSession,
  STAFF_SESSION_TTL_MS,
} from './session-service';

beforeEach(resetDatabase);
afterEach(() => {
  vi.useRealTimers();
  delete process.env.TEST_ENFORCE_MFA;
});

async function person(...roles: Role[]) {
  const p = await createPlayer();
  for (const role of roles) await prisma.userRole.create({ data: { userId: p.userId, role } });
  const session = await createWebSession(p.userId, meta, true);
  return { ...p, token: session.token, actor: (await actorFromWebToken(session.token))! };
}

const secretOf = async (actor: Parameters<typeof mfaSetup>[0]) =>
  (await mfaSetup(actor)).secret.replace(/\s/g, '');

describe('owner role (D78)', () => {
  it('owners act as admins, alone see the Stripe and mail server settings', async () => {
    const owner = await person(Role.OWNER);
    const admin = await person(Role.ADMIN);
    expect(owner.actor.roles).toEqual(expect.arrayContaining(['OWNER', 'ADMIN']));

    await expect(getPaymentSettings(admin.actor)).rejects.toMatchObject({ code: 'notFound' });
    await expect(getPaymentSettings(owner.actor)).resolves.toBeTruthy();
    // Since D79 the whole E-mail section is for owners.
    await expect(getEmailSettings(admin.actor)).rejects.toMatchObject({ code: 'notFound' });
    expect((await getEmailSettings(owner.actor)).owner).toBe(true);
  });

  it('is hidden from admins, protected from them, and never lost', async () => {
    const owner = await person(Role.OWNER);
    const admin = await person(Role.ADMIN);
    const player = await person();

    const seen = (await listUsers(admin.actor, {})).users.find((u) => u.id === owner.userId)!;
    expect(seen.roles).toEqual(['PLAYER']);
    expect(seen.protected).toBe(true);
    expect(
      (await listUsers(owner.actor, {})).users.find((u) => u.id === owner.userId)!.roles,
    ).toContain('OWNER');

    // Admins can't touch an owner, nor hand out the role.
    const change = (userId: string, role: string) => ({ userId, role });
    await expect(
      revokeRole(admin.actor, change(owner.userId, 'OWNER'), meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    await expect(
      grantRole(admin.actor, change(owner.userId, 'ORGANISER'), meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    await expect(
      grantRole(admin.actor, change(player.userId, 'OWNER'), meta),
    ).rejects.toMatchObject({ code: 'notFound' });

    // An owner can; the last one can't step down.
    await expect(
      revokeRole(owner.actor, change(owner.userId, 'OWNER'), meta),
    ).rejects.toMatchObject({ code: 'lastOwner' });
    await grantRole(owner.actor, change(player.userId, 'OWNER'), meta);
    await revokeRole(owner.actor, change(owner.userId, 'OWNER'), meta);

    // The site-wide log is for owners only (D79); it records the owner change.
    await expect(listAuditLog(admin.actor, {})).rejects.toMatchObject({ code: 'notFound' });
    const newOwner = (await actorFromWebToken(player.token))!;
    const log = await listAuditLog(newOwner, {});
    expect(log.entries.some((e) => JSON.stringify(e.after ?? '').includes('OWNER'))).toBe(true);
  });
});

describe('two-step login (D78)', () => {
  it('is required for admins before they can use the portal', async () => {
    process.env.TEST_ENFORCE_MFA = '1';
    const admin = await person(Role.ADMIN);
    expect(admin.actor.roles).not.toContain('ADMIN');
    expect(admin.actor.mfaSetupRequired).toBe(true);
    const other = await createWebSession(admin.userId, meta, true);

    // Start of a 30-second step, so the next step is exactly 30 seconds later.
    const t0 = Math.ceil(Date.now() / 30_000) * 30_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(t0);
    const secret = await secretOf(admin.actor);
    // The same secret on a second look, until confirmed.
    expect(await secretOf(admin.actor)).toBe(secret);
    await expect(confirmMfaSetup(admin.actor, { code: '000000' }, meta)).rejects.toMatchObject({
      code: 'mfaInvalid',
    });
    const codes = await confirmMfaSetup(
      admin.actor,
      { code: totpCode(secret, currentStep()) },
      meta,
    );
    expect(codes).toHaveLength(10);

    const now = (await actorFromWebToken(admin.token))!;
    expect(now.roles).toContain('ADMIN');
    expect(now.mfaSetupRequired).toBe(false);
    // Other devices were signed out.
    expect(await actorFromWebToken(other.token)).toBeNull();

    // Next login: password alone signs nobody in.
    const pending = await createWebSession(admin.userId, meta, true, { mfaPending: true });
    expect(await actorFromWebToken(pending.token)).toBeNull();
    // The code used for setup can't be used again; the next one can.
    await expect(
      checkMfaCode(admin.userId, totpCode(secret, currentStep()), meta),
    ).rejects.toMatchObject({ code: 'mfaInvalid' });
    vi.setSystemTime(t0 + 30_000);
    await checkMfaCode(admin.userId, totpCode(secret, currentStep()), meta);
    const session = await prisma.userSession.findFirstOrThrow({
      where: { tokenHash: { not: null }, mfaPending: true },
    });
    const { expiresAt } = await completeMfaSession(session.id, true);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(STAFF_SESSION_TTL_MS);
    expect((await actorFromWebToken(pending.token))?.roles).toContain('ADMIN');

    // A recovery code works once.
    await expect(checkMfaCode(admin.userId, codes[0]!.toUpperCase(), meta)).resolves.toEqual({
      recoveryUsed: true,
    });
    await expect(checkMfaCode(admin.userId, codes[0]!, meta)).rejects.toMatchObject({
      code: 'mfaInvalid',
    });

    // Switching it off needs password and code; then the admin is a player again.
    vi.setSystemTime(t0 + 60_000);
    await expect(
      disableMfa(now, { password: 'wrong', code: totpCode(secret, currentStep()) }, meta),
    ).rejects.toMatchObject({ code: 'wrongPassword' });
    await disableMfa(
      now,
      { password: admin.password, code: totpCode(secret, currentStep()) },
      meta,
    );
    expect((await actorFromWebToken(admin.token))?.roles).not.toContain('ADMIN');
  });

  it('can be reset by an owner for anyone, by an admin only for non-admins', async () => {
    const owner = await person(Role.OWNER);
    const admin = await person(Role.ADMIN);
    const admin2 = await person(Role.ADMIN);
    const player = await person();
    for (const p of [admin2, player]) {
      const secret = await secretOf(p.actor);
      await confirmMfaSetup(p.actor, { code: totpCode(secret, currentStep()) }, meta);
    }
    await expect(resetUserMfa(admin.actor, admin2.userId, meta)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(resetUserMfa(admin.actor, owner.userId, meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    await resetUserMfa(admin.actor, player.userId, meta);
    await resetUserMfa(owner.actor, admin2.userId, meta);
    const users = await prisma.user.findMany({
      where: { id: { in: [admin2.userId, player.userId] } },
      select: { totpEnabledAt: true },
    });
    expect(users.every((u) => u.totpEnabledAt === null)).toBe(true);
    expect(await actorFromWebToken(player.token)).toBeNull();
  });
});
