import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import { authenticate } from './auth-service';
import { deleteMyAccount, exportMyData } from './gdpr-service';
import { getMyAccount, updateMyProfile } from './profile-service';
import { grantRole, listUsers, removeUsers, revokeRole } from './role-service';
import { actorFromWebToken, createWebSession, type Actor } from './session-service';

beforeEach(resetDatabase);

async function actorFor(userId: string): Promise<Actor> {
  const { token } = await createWebSession(userId, meta, true);
  return (await actorFromWebToken(token))!;
}

async function makeAdmin(userId: string) {
  await prisma.userRole.create({ data: { userId, role: Role.ADMIN } });
  return actorFor(userId);
}

describe('roles', () => {
  it('lets an admin add another admin, audited and emailed', async () => {
    const admin = await makeAdmin((await createPlayer()).userId);
    const target = await createPlayer();

    await grantRole(admin, { userId: target.userId, role: 'ADMIN' }, meta);
    const roles = await prisma.userRole.findMany({ where: { userId: target.userId } });
    expect(roles.map((r) => r.role).sort()).toEqual(['ADMIN', 'PLAYER']);
    expect(roles.find((r) => r.role === 'ADMIN')?.grantedById).toBe(admin.userId);
    expect(await prisma.auditLog.count({ where: { action: 'user.role.grant' } })).toBe(1);
    expect(lastMailTo(target.email).mail?.text).toContain('Beheerder');
  });

  it('refuses non-admins', async () => {
    const player = await actorFor((await createPlayer()).userId);
    const other = await createPlayer();
    await expect(
      grantRole(player, { userId: other.userId, role: 'ADMIN' }, meta),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(listUsers(player, {})).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('never removes the last admin', async () => {
    const admin = await makeAdmin((await createPlayer()).userId);
    await expect(
      revokeRole(admin, { userId: admin.userId, role: 'ADMIN' }, meta),
    ).rejects.toMatchObject({
      code: 'lastAdmin',
    });

    const second = await createPlayer();
    await grantRole(admin, { userId: second.userId, role: 'ADMIN' }, meta);
    await revokeRole(admin, { userId: admin.userId, role: 'ADMIN' }, meta);
    expect(await prisma.userRole.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('searches users by name, email or member number', async () => {
    const admin = await makeAdmin((await createPlayer()).userId);
    const target = await createPlayer({ firstName: 'Lotte', email: 'lotte@example.test' });
    expect((await listUsers(admin, { q: 'lotte' })).users.map((u) => u.id)).toEqual([
      target.userId,
    ]);
    expect((await listUsers(admin, { q: target.memberNumber.toLowerCase() })).total).toBe(1);
  });
});

describe('profile', () => {
  it('updates profile fields and preferred events', async () => {
    const { userId } = await createPlayer();
    const actor = await actorFor(userId);
    await updateMyProfile(
      actor,
      {
        firstName: 'Lotte',
        lastNamePrefix: 'van',
        lastName: 'Dijk',
        phone: '0687654321',
        dateOfBirth: '1990-06-01',
        gender: 'FEMALE',
        preferredDisciplines: ['DD', 'GD'],
        locale: 'en',
        publicProfile: true,
        nationality: 'nl',
      },
      meta,
    );
    const account = await getMyAccount(actor);
    expect(account.name).toBe('Lotte van Dijk');
    expect(account.locale).toBe('en');
    expect(account.profile).toMatchObject({
      nationality: 'NL',
      preferredDisciplines: ['DD', 'GD'],
      publicProfile: true,
    });
  });

  it("won't turn an adult into a minor without parental consent", async () => {
    const actor = await actorFor((await createPlayer()).userId);
    const year = new Date().getUTCFullYear() - 10;
    await expect(
      updateMyProfile(
        actor,
        {
          firstName: 'A',
          lastName: 'B',
          phone: '0612345678',
          dateOfBirth: `${year}-01-01`,
          gender: 'MALE',
          locale: 'nl',
        },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('GDPR', () => {
  it('exports my data without secrets', async () => {
    const { userId } = await createPlayer();
    const data = JSON.parse(JSON.stringify(await exportMyData(await actorFor(userId))));
    expect(data.account.playerProfile.memberNumber).toBe('TE100001');
    expect(data.account.consents).toHaveLength(2);
    expect(JSON.stringify(data)).not.toContain('argon2');
    expect(data.account).not.toHaveProperty('passwordHash');
  });

  it('anonymises the account, logs out and blocks login', async () => {
    const { userId, email, password } = await createPlayer({ phone: '0611111111' });
    const actor = await actorFor(userId);
    await expect(
      deleteMyAccount(actor, { password: 'wrong', confirm: true }),
    ).rejects.toMatchObject({
      code: 'wrongPassword',
    });
    await deleteMyAccount(actor, { password, confirm: true });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { playerProfile: true },
    });
    expect(user.email).toBe(`deleted+${userId}@invalid.tourneasy`);
    expect(user.anonymisedAt).not.toBeNull();
    expect(user.playerProfile).toMatchObject({
      firstName: 'Deleted',
      phone: null,
      publicProfile: false,
    });
    expect(user.playerProfile?.dateOfBirth.toISOString()).toBe('1995-01-01T00:00:00.000Z');
    expect(await actorFromWebToken('x')).toBeNull();
    await expect(authenticate({ identifier: email, password }, meta)).rejects.toMatchObject({
      code: 'invalidCredentials',
    });
  });

  it('keeps the last admin from deleting their account', async () => {
    const { userId, password } = await createPlayer();
    const admin = await makeAdmin(userId);
    await expect(deleteMyAccount(admin, { password, confirm: true })).rejects.toMatchObject({
      code: 'lastAdmin',
    });
  });
});

describe('admin removes accounts (D72)', () => {
  it('removes selected players in one go, with the admin password, and keeps staff safe', async () => {
    const adminPlayer = await createPlayer();
    const admin = await makeAdmin(adminPlayer.userId);
    const [a, b] = [await createPlayer(), await createPlayer()];
    const organiser = await createPlayer();
    await prisma.userRole.create({ data: { userId: organiser.userId, role: Role.ORGANISER } });
    const aSession = await actorFor(a.userId);

    // Only admins, with their own password; never themselves or staff.
    await expect(
      removeUsers(aSession, { userIds: [b.userId], password: a.password }, meta),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      removeUsers(admin, { userIds: [a.userId], password: 'wrong-password' }, meta),
    ).rejects.toMatchObject({ code: 'wrongPassword' });
    await expect(
      removeUsers(
        admin,
        { userIds: [a.userId, adminPlayer.userId], password: adminPlayer.password },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'removeSelf' });
    await expect(
      removeUsers(
        admin,
        { userIds: [a.userId, organiser.userId], password: adminPlayer.password },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'removeStaff' });
    expect(await prisma.user.count({ where: { anonymisedAt: { not: null } } })).toBe(0);

    const removed = await removeUsers(
      admin,
      { userIds: [a.userId, b.userId, b.userId], password: adminPlayer.password },
      meta,
    );
    expect(removed).toBe(2);
    const gone = await prisma.user.findUniqueOrThrow({
      where: { id: a.userId },
      include: { playerProfile: true },
    });
    expect(gone).toMatchObject({ name: 'Deleted user', isActive: false });
    expect(gone.email).toBe(`deleted+${a.userId}@invalid.tourneasy`);
    expect(gone.playerProfile).toMatchObject({
      firstName: 'Deleted',
      phone: null,
      contactEmail: null,
    });
    // Logged out, gone from the list, and logged as the admin's action.
    expect(await actorFromWebToken('x')).toBeNull();
    expect((await listUsers(admin, {})).users.map((u) => u.id)).not.toContain(a.userId);
    expect(
      await prisma.auditLog.count({
        where: { action: 'user.delete.byAdmin', actorId: admin.userId },
      }),
    ).toBe(2);
    expect(await prisma.userSession.count({ where: { userId: a.userId, revokedAt: null } })).toBe(
      0,
    );
  });
});
