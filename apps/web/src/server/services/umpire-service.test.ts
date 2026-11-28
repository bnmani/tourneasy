import { randomInt } from 'node:crypto';
import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { actorFromWebToken, createWebSession } from './session-service';
import {
  createUmpire,
  resetUmpireAccess,
  revokeUmpire,
  signInUmpire,
  verifyUmpireSession,
} from './umpire-service';

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, randomInt: vi.fn(original.randomInt) };
});

beforeEach(resetDatabase);

async function actorWith(role: Role) {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

let n = 0;
async function tournament(endsOn = '2027-03-13', organiserId?: string) {
  n += 1;
  const venue = await prisma.venue.create({
    data: {
      name: `Hal ${n}`,
      slug: `hal-${n}`,
      street: 'Sportlaan',
      houseNumber: '1',
      postcode: '3511 AB',
      city: 'Utrecht',
      province: 'UTRECHT',
      numberOfCourts: 4,
    },
  });
  return prisma.tournament.create({
    data: {
      name: `Toernooi ${n}`,
      slug: `toernooi-${n}`,
      venueId: venue.id,
      startsOn: new Date(endsOn),
      endsOn: new Date(endsOn),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2027-02-01'),
      entryDeadline: new Date('2027-02-01'),
      withdrawalDeadline: new Date('2027-02-01'),
      ...(organiserId ? { organisers: { create: { userId: organiserId } } } : {}),
    },
  });
}

function qrTokenOf(qrUrl: string) {
  return new URL(qrUrl).searchParams.get('token')!;
}

async function setup(endsOn?: string) {
  const admin = await actorWith(Role.ADMIN);
  const t = await tournament(endsOn);
  const created = await createUmpire(admin, { tournamentId: t.id, displayName: 'Anna' }, meta);
  const row = await prisma.umpire.findFirstOrThrow({ where: { tournamentId: t.id } });
  return { admin, t, created, row };
}

describe('umpire profiles and sign-in', () => {
  it('PIN and QR are stored only as hashes', async () => {
    const { created, row, admin } = await setup();
    const token = qrTokenOf(created.qrUrl);
    expect(created.pin).toMatch(/^\d{6}$/);
    expect(row.pinHash).not.toContain(created.pin);
    expect(row.qrTokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);
    const audit = JSON.stringify(await prisma.auditLog.findMany());
    expect(audit).not.toContain(token);
    expect(audit).not.toContain(`"${created.pin}"`);
    expect(
      await prisma.auditLog.count({ where: { actorId: admin.userId, entityId: row.id } }),
    ).toBe(1);
  });

  it('signs in with the PIN or the QR token', async () => {
    const { created, row } = await setup();
    const a = await signInUmpire({ pin: created.pin }, 'device-1', meta);
    expect(a.umpireId).toBe(row.id);
    expect((await verifyUmpireSession(a.sessionToken, 'device-1')).umpireId).toBe(row.id);
    const b = await signInUmpire({ qrToken: qrTokenOf(created.qrUrl) }, 'device-1', meta);
    expect(b.umpireId).toBe(row.id);
  });

  it('refuses a wrong PIN and an unknown QR token', async () => {
    const { created } = await setup();
    const wrong = created.pin === '000000' ? '000001' : '000000';
    await expect(signInUmpire({ pin: wrong }, 'd', meta)).rejects.toMatchObject({
      code: 'invalidCredentials',
    });
    await expect(signInUmpire({ qrToken: 'nope' }, 'd', meta)).rejects.toMatchObject({
      code: 'invalidCredentials',
    });
  });

  it('a second device is refused while the first device holds the profile', async () => {
    const { created } = await setup();
    await signInUmpire({ pin: created.pin }, 'device-1', meta);
    await expect(signInUmpire({ pin: created.pin }, 'device-2', meta)).rejects.toMatchObject({
      code: 'invalidCredentials',
    });
    await expect(
      signInUmpire({ qrToken: qrTokenOf(created.qrUrl) }, 'device-2', meta),
    ).rejects.toMatchObject({ code: 'invalidCredentials' });
    await expect(signInUmpire({ pin: created.pin }, 'device-1', meta)).resolves.toBeTruthy();
  });

  it('a wrong PIN and a profile held by another phone answer the same way', async () => {
    const { created } = await setup();
    await signInUmpire({ pin: created.pin }, 'device-1', meta);
    const wrong = created.pin === '000000' ? '000001' : '000000';
    const a = await signInUmpire({ pin: wrong }, 'device-2', meta).catch((e) => e);
    const b = await signInUmpire({ pin: created.pin }, 'device-2', meta).catch((e) => e);
    expect([a.code, a.status, a.details]).toEqual([b.code, b.status, b.details]);
    expect(b.status).toBe(401);
  });

  it('finds the profile by PIN without scanning, and create never reuses a PIN', async () => {
    const admin = await actorWith(Role.ADMIN);
    const t = await tournament();
    const mocked = vi.mocked(randomInt) as unknown as ReturnType<typeof vi.fn>;
    mocked.mockReturnValueOnce(123456);
    const first = await createUmpire(admin, { tournamentId: t.id, displayName: 'A' }, meta);
    expect(first.pin).toBe('123456');
    mocked.mockReturnValueOnce(123456).mockReturnValueOnce(123456).mockReturnValueOnce(654321);
    const second = await createUmpire(admin, { tournamentId: t.id, displayName: 'B' }, meta);
    expect(second.pin).toBe('654321');
    const rows = await prisma.umpire.findMany({ orderBy: { displayName: 'asc' } });
    expect(rows[0]!.pinHash).not.toBe(rows[1]!.pinHash);
    expect((await signInUmpire({ pin: '654321' }, 'x', meta)).umpireId).toBe(rows[1]!.id);
    // A reset also skips a PIN somebody holds.
    mocked.mockReturnValueOnce(123456).mockReturnValueOnce(777777);
    expect((await resetUmpireAccess(admin, rows[1]!.id, meta)).pin).toBe('777777');
  });

  it('expired or revoked umpire token is refused', async () => {
    const { created, row, admin } = await setup();
    const s = await signInUmpire({ pin: created.pin }, 'd1', meta);
    await prisma.umpire.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(verifyUmpireSession(s.sessionToken, 'd1')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(signInUmpire({ pin: created.pin }, 'd1', meta)).rejects.toMatchObject({
      code: 'invalidCredentials',
    });

    await prisma.umpire.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await expect(verifyUmpireSession(s.sessionToken, 'd1')).resolves.toBeTruthy();
    await revokeUmpire(admin, row.id, meta);
    await expect(verifyUmpireSession(s.sessionToken, 'd1')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(signInUmpire({ pin: created.pin }, 'd1', meta)).rejects.toMatchObject({
      code: 'invalidCredentials',
    });
  });

  it('refuses a tampered token and a token used from another device', async () => {
    const { created } = await setup();
    const s = await signInUmpire({ pin: created.pin }, 'd1', meta);
    await expect(verifyUmpireSession(s.sessionToken + 'x', 'd1')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(verifyUmpireSession(s.sessionToken, 'd2')).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('reset gives a new PIN and QR, ends the old session and frees the device', async () => {
    const { created, row, admin } = await setup();
    const s = await signInUmpire({ pin: created.pin }, 'd1', meta);
    const fresh = await resetUmpireAccess(admin, row.id, meta);
    expect(qrTokenOf(fresh.qrUrl)).not.toBe(qrTokenOf(created.qrUrl));
    await expect(verifyUmpireSession(s.sessionToken, 'd1')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(
      signInUmpire({ qrToken: qrTokenOf(created.qrUrl) }, 'd1', meta),
    ).rejects.toMatchObject({
      code: 'invalidCredentials',
    });
    await expect(signInUmpire({ pin: fresh.pin }, 'd2', meta)).resolves.toBeTruthy();
  });

  it('expires at the end of the tournament day in Amsterdam (winter and summer time)', async () => {
    const winter = await setup('2027-03-13');
    expect(winter.row.expiresAt.toISOString()).toBe('2027-03-13T23:00:00.000Z');
    const summer = await setup('2027-07-10');
    expect(summer.row.expiresAt.toISOString()).toBe('2027-07-10T22:00:00.000Z');
  });

  it('a session ends at the end of the day it started, even if the profile lasts longer', async () => {
    const { created, row } = await setup('2027-03-15');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2027-03-13T10:00:00Z'));
      const s = await signInUmpire({ pin: created.pin }, 'd', meta);
      expect(row.expiresAt.toISOString()).toBe('2027-03-15T23:00:00.000Z');
      expect(s.expiresAt.toISOString()).toBe('2027-03-13T23:00:00.000Z');
      await expect(verifyUmpireSession(s.sessionToken, 'd')).resolves.toBeTruthy();
      vi.setSystemTime(new Date('2027-03-13T23:00:01Z'));
      await expect(verifyUmpireSession(s.sessionToken, 'd')).rejects.toMatchObject({
        code: 'unauthorized',
      });
      // Next day: sign in again gets a session for that day.
      vi.setSystemTime(new Date('2027-03-14T08:00:00Z'));
      const next = await signInUmpire({ pin: created.pin }, 'd', meta);
      expect(next.expiresAt.toISOString()).toBe('2027-03-14T23:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a session never outlasts the profile', async () => {
    const { created } = await setup('2027-03-13');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2027-03-13T10:00:00Z'));
      const s = await signInUmpire({ pin: created.pin }, 'd', meta);
      expect(s.expiresAt.toISOString()).toBe('2027-03-13T23:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed without a request address: sign-in is still rate limited', async () => {
    const { created } = await setup();
    const wrong = created.pin === '000000' ? '000001' : '000000';
    for (let i = 0; i < 20; i++) {
      await expect(signInUmpire({ pin: wrong }, 'd', {})).rejects.toMatchObject({
        code: 'invalidCredentials',
      });
    }
    await expect(signInUmpire({ pin: created.pin }, 'd', {})).rejects.toMatchObject({
      code: 'rateLimited',
    });
    expect(
      await prisma.rateLimitBucket.count({ where: { key: 'umpire-sign-in:ip:unknown' } }),
    ).toBe(1);
    // No limiter is skipped when the address is missing here either.
    await expect(signInUmpire({ pin: created.pin }, 'd')).rejects.toMatchObject({
      code: 'rateLimited',
    });
  });

  it('verifyUmpireSession refuses a missing token or device', async () => {
    const { created } = await setup();
    const s = await signInUmpire({ pin: created.pin }, 'd1', meta);
    await expect(verifyUmpireSession('', 'd1')).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(verifyUmpireSession(s.sessionToken, '')).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('per-address limit trips after 20 attempts from one address only', async () => {
    const { created } = await setup();
    const wrongQr = { qrToken: 'x'.repeat(40) };
    for (let i = 0; i < 20; i++) {
      await expect(signInUmpire(wrongQr, 'd', meta)).rejects.toMatchObject({
        code: 'invalidCredentials',
      });
    }
    await expect(signInUmpire(wrongQr, 'd', meta)).rejects.toMatchObject({ code: 'rateLimited' });
    await expect(
      signInUmpire({ qrToken: qrTokenOf(created.qrUrl) }, 'd', { ip: '198.51.100.99' }),
    ).resolves.toBeTruthy();
  });

  it('30 failed PINs from many addresses close PIN sign-in for everyone, the QR still works', async () => {
    const { created } = await setup();
    const wrong = created.pin === '000000' ? '000001' : '000000';
    for (let i = 0; i < 30; i++) {
      await expect(signInUmpire({ pin: wrong }, 'd', { ip: `192.0.2.${i}` })).rejects.toMatchObject(
        {
          code: 'invalidCredentials',
        },
      );
    }
    await expect(
      signInUmpire({ pin: created.pin }, 'd', { ip: '203.0.113.200' }),
    ).rejects.toMatchObject({ code: 'rateLimited' });
    await expect(
      signInUmpire({ qrToken: qrTokenOf(created.qrUrl) }, 'd', { ip: '203.0.113.200' }),
    ).resolves.toBeTruthy();
  });

  it('only admins and the tournament organisers manage umpires', async () => {
    const t = await tournament();
    const stranger = await actorWith(Role.ORGANISER);
    await expect(
      createUmpire(stranger, { tournamentId: t.id, displayName: 'X' }, meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    const p = await createPlayer();
    const player = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
    await expect(
      createUmpire(player, { tournamentId: t.id, displayName: 'X' }, meta),
    ).rejects.toMatchObject({ code: 'notFound' });

    const own = await actorWith(Role.ORGANISER);
    await prisma.tournamentOrganiser.create({ data: { tournamentId: t.id, userId: own.userId } });
    await createUmpire(own, { tournamentId: t.id, displayName: 'Bram' }, meta);
    const row = await prisma.umpire.findFirstOrThrow({ where: { tournamentId: t.id } });
    await expect(revokeUmpire(stranger, row.id, meta)).rejects.toMatchObject({ code: 'notFound' });
    await expect(resetUmpireAccess(stranger, row.id, meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    await revokeUmpire(own, row.id, meta);
    expect(
      (await prisma.umpire.findUniqueOrThrow({ where: { id: row.id } })).revokedAt,
    ).not.toBeNull();
  });

  it('rejects an empty name', async () => {
    const admin = await actorWith(Role.ADMIN);
    const t = await tournament();
    await expect(
      createUmpire(admin, { tournamentId: t.id, displayName: '   ' }, meta),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('fails closed without UMPIRE_TOKEN_SECRET', async () => {
    const admin = await actorWith(Role.ADMIN);
    const t = await tournament();
    const saved = process.env.UMPIRE_TOKEN_SECRET;
    delete process.env.UMPIRE_TOKEN_SECRET;
    try {
      await expect(
        createUmpire(admin, { tournamentId: t.id, displayName: 'Z' }, meta),
      ).rejects.toThrow(/UMPIRE_TOKEN_SECRET/);
      expect(await prisma.umpire.count()).toBe(0);
    } finally {
      process.env.UMPIRE_TOKEN_SECRET = saved;
    }
  });
});
