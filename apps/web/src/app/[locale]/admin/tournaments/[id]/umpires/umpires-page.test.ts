import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { actorFromWebToken, createWebSession, type Actor } from '@/server/services/session-service';
import { signInUmpire } from '@/server/services/umpire-service';

// The actions read the signed-in user from the request; tests choose who that is.
let current: Actor | null = null;
vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/web', () => ({
  getActor: async () => current,
  currentRequestMeta: async () => meta,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
}));

const { createUmpireAction, resetUmpireAction, revokeUmpireAction } = await import('./actions');
const { listUmpires } = await import('@/server/services/umpire-admin');

beforeEach(async () => {
  await resetDatabase();
  current = null;
});

async function actorWith(role: Role | null, organiserOf?: string) {
  const p = await createPlayer();
  if (role) await prisma.userRole.create({ data: { userId: p.userId, role } });
  if (organiserOf) {
    await prisma.userRole.create({ data: { userId: p.userId, role: Role.ORGANISER } });
    await prisma.tournamentOrganiser.create({
      data: { tournamentId: organiserOf, userId: p.userId },
    });
  }
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

let n = 0;
async function tournament() {
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
      startsOn: new Date('2099-03-13'),
      endsOn: new Date('2099-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2027-02-01'),
      entryDeadline: new Date('2027-02-01'),
      withdrawalDeadline: new Date('2027-02-01'),
    },
  });
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe('admin umpire page', () => {
  it('new PIN is shown once after create and not on the list', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    const t = await tournament();
    current = await actorWith(Role.ADMIN);

    const state = await createUmpireAction('en', t.id, {}, form({ displayName: 'Anna' }));
    expect(state.reveal?.pin).toMatch(/^\d{6}$/);
    expect(state.reveal?.qrUrl).toContain('/umpire/sign-in#token=');
    expect(new URL(state.reveal!.qrUrl).search).toBe('');
    expect(state.reveal?.qrImage).toMatch(/^data:image\/svg\+xml/);
    expect(state.reveal?.displayName).toBe('Anna');

    const list = await listUmpires(current, t.id);
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]!).sort()).toEqual(
      ['displayName', 'expiresAt', 'hasDevice', 'id', 'status'].sort(),
    );
    const dump = JSON.stringify(list);
    expect(dump).not.toContain(state.reveal!.pin);
    expect(dump).not.toContain(
      new URLSearchParams(new URL(state.reveal!.qrUrl).hash.slice(1)).get('token')!,
    );
    expect(list[0]!.status).toBe('active');

    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(state.reveal!.pin);
    }
    vi.restoreAllMocks();
  });

  it('reset shows a new PIN once and the old one stops working', async () => {
    const t = await tournament();
    current = await actorWith(Role.ADMIN);
    const created = await createUmpireAction('en', t.id, {}, form({ displayName: 'Anna' }));
    const [row] = await listUmpires(current, t.id);

    const reset = await resetUmpireAction('en', t.id, row!.id, {}, form({}));
    expect(reset.reveal?.pin).toMatch(/^\d{6}$/);
    await expect(signInUmpire({ pin: created.reveal!.pin }, 'phone-1', meta)).rejects.toMatchObject(
      { code: 'invalidCredentials' },
    );
    await expect(signInUmpire({ pin: reset.reveal!.pin }, 'phone-1', meta)).resolves.toMatchObject({
      umpireId: row!.id,
    });
  });

  it('revoked umpire shows as revoked and cannot sign in', async () => {
    const t = await tournament();
    current = await actorWith(Role.ADMIN);
    const created = await createUmpireAction('en', t.id, {}, form({ displayName: 'Anna' }));
    const [row] = await listUmpires(current, t.id);

    await expect(revokeUmpireAction('en', t.id, row!.id)).rejects.toMatchObject({
      url: `/en/admin/tournaments/${t.id}/umpires?status=umpireRevoked`,
    });
    expect((await listUmpires(current, t.id))[0]!.status).toBe('revoked');
    await expect(signInUmpire({ pin: created.reveal!.pin }, 'phone-1', meta)).rejects.toMatchObject(
      { code: 'invalidCredentials' },
    );
  });

  it('shows expired profiles as expired', async () => {
    const t = await tournament();
    current = await actorWith(Role.ADMIN);
    await createUmpireAction('en', t.id, {}, form({ displayName: 'Anna' }));
    await prisma.umpire.updateMany({ data: { expiresAt: new Date('2020-01-01') } });
    expect((await listUmpires(current, t.id))[0]!.status).toBe('expired');
  });

  it('only organisers and admins of the tournament can open the page', async () => {
    const t = await tournament();
    const other = await tournament();
    const organiser = await actorWith(null, t.id);
    const outsider = await actorWith(null);
    const otherOrganiser = await actorWith(null, other.id);
    const admin = await actorWith(Role.ADMIN);

    await expect(listUmpires(organiser, t.id)).resolves.toEqual([]);
    await expect(listUmpires(admin, t.id)).resolves.toEqual([]);
    await expect(listUmpires(outsider, t.id)).rejects.toMatchObject({ code: 'notFound' });
    await expect(listUmpires(otherOrganiser, t.id)).rejects.toMatchObject({ code: 'notFound' });
    await expect(listUmpires(null, t.id)).rejects.toMatchObject({ code: 'unauthorized' });

    // Every action checks too: no reveal, no row.
    current = outsider;
    const denied = await createUmpireAction('en', t.id, {}, form({ displayName: 'Anna' }));
    expect(denied.reveal).toBeUndefined();
    expect(denied.error).toBe('notFound');
    expect(await prisma.umpire.count()).toBe(0);

    current = organiser;
    const ok = await createUmpireAction('en', t.id, {}, form({ displayName: 'Anna' }));
    expect(ok.reveal?.pin).toMatch(/^\d{6}$/);

    // An organiser of another tournament can't reset or revoke it.
    const row = await prisma.umpire.findFirstOrThrow();
    current = otherOrganiser;
    const resetDenied = await resetUmpireAction('en', t.id, row.id, {}, form({}));
    expect(resetDenied.reveal).toBeUndefined();
    await expect(revokeUmpireAction('en', t.id, row.id)).rejects.toMatchObject({
      url: expect.stringContaining('status=notFound'),
    });
    expect((await prisma.umpire.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).toBeNull();
  });
});
