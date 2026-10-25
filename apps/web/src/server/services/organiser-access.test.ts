import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { listTournamentAudit } from './admin-service';
import { actorFromWebToken, createWebSession } from './session-service';
import { canEditVenue, createVenue, updateVenue } from './venue-service';

beforeEach(resetDatabase);

async function actorWith(role: Role) {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

const venueInput = (name: string) => ({
  name,
  street: 'Sportlaan',
  houseNumber: '1',
  postcode: '3511 AB',
  city: 'Utrecht',
  province: 'UTRECHT',
  country: 'NL',
  numberOfCourts: '4',
});

async function tournament(name: string, venueId: string, organiserId?: string) {
  return prisma.tournament.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/\s/g, '-'),
      venueId,
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2027-02-01'),
      entryDeadline: new Date('2027-02-01'),
      withdrawalDeadline: new Date('2027-02-01'),
      ...(organiserId ? { organisers: { create: { userId: organiserId } } } : {}),
    },
  });
}

describe('organiser access (D77)', () => {
  it('organisers add venues and edit only venues no one else uses', async () => {
    const admin = await actorWith(Role.ADMIN);
    const org = await actorWith(Role.ORGANISER);
    const own = await createVenue(org, venueInput('Eigen hal'), meta);
    expect(await canEditVenue(org, own.id)).toBe(true);
    await updateVenue(org, own.id, { ...venueInput('Eigen hal'), numberOfCourts: '6' }, meta);

    const shared = await createVenue(admin, venueInput('Gedeelde hal'), meta);
    await tournament('Mijn toernooi', shared.id, org.userId);
    expect(await canEditVenue(org, shared.id)).toBe(true);
    await tournament('Ander toernooi', shared.id);
    expect(await canEditVenue(org, shared.id)).toBe(false);
    await expect(updateVenue(org, shared.id, venueInput('X'), meta)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await canEditVenue(admin, shared.id)).toBe(true);

    const p = await createPlayer();
    const player = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
    await expect(createVenue(player, venueInput('Nee'), meta)).rejects.toBeTruthy();
  });

  it('shows a tournament change log to its organisers only', async () => {
    const admin = await actorWith(Role.ADMIN);
    const org = await actorWith(Role.ORGANISER);
    const other = await actorWith(Role.ORGANISER);
    const venue = await createVenue(admin, venueInput('Hal'), meta);
    const t = await tournament('Log Open', venue.id, org.userId);
    await prisma.auditLog.create({
      data: {
        actorId: admin.userId,
        action: 'tournament.update',
        entityType: 'Tournament',
        entityId: t.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: admin.userId,
        action: 'tournament.update',
        entityType: 'Tournament',
        entityId: venue.id,
      },
    });
    const log = await listTournamentAudit(org, t.id);
    expect(log.entries.map((e) => e.entityId)).toEqual([t.id]);
    await expect(listTournamentAudit(other, t.id)).rejects.toMatchObject({ code: 'notFound' });
  });
});
