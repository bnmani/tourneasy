import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { readXlsx, toXlsx } from '../lib/xlsx';
import { authenticate, signUp } from './auth-service';
import { createEvent, deleteEvent, updateEvent } from './event-service';
import {
  createPlayer as adminCreatePlayer,
  exportPlayersCsv,
  exportPlayersXlsx,
  importPlayersCsv,
  importPlayersFile,
  playerXlsxTemplate,
  listPlayers,
  mergePlayers,
} from './player-service';
import { actorFromWebToken, createWebSession, type Actor } from './session-service';
import {
  addOrganiser,
  changeTournamentStatus,
  createTournament,
  getTournament,
  listTournaments,
  updateTournament,
} from './tournament-service';
import { createVenue, setVenueArchived, updateVenue } from './venue-service';

beforeEach(resetDatabase);

async function actorFor(userId: string): Promise<Actor> {
  const { token } = await createWebSession(userId, meta, true);
  return (await actorFromWebToken(token))!;
}

async function newAdmin(role: Role = Role.ADMIN) {
  const { userId } = await createPlayer();
  await prisma.userRole.create({ data: { userId, role } });
  return actorFor(userId);
}

const venueInput = {
  name: 'Sporthal De Shuttle',
  street: 'Shuttleweg',
  houseNumber: '12',
  postcode: '3511ab',
  city: 'Utrecht',
  province: 'UTRECHT',
  numberOfCourts: '6',
};

const tournamentInput = {
  name: 'Utrecht Open',
  startsOn: '2027-03-13',
  endsOn: '2027-03-14',
  dayStartTime: '09:00',
  registrationOpensAt: '2026-11-01T09:00',
  registrationClosesAt: '2027-02-27T23:59',
  withdrawalDeadline: '2027-02-20T23:59',
};

describe('venues', () => {
  it('creates courts from the court count and keeps them in sync', async () => {
    const admin = await newAdmin();
    const venue = await createVenue(admin, venueInput, meta);
    expect(venue.postcode).toBe('3511 AB');
    expect(await prisma.court.count({ where: { venueId: venue.id } })).toBe(6);
    await updateVenue(admin, venue.id, { ...venueInput, numberOfCourts: '4' }, meta);
    expect(await prisma.court.count({ where: { venueId: venue.id } })).toBe(4);
  });

  it('creates a new venue from the tournament form, validating both together', async () => {
    const admin = await newAdmin();
    await expect(
      createTournament(
        admin,
        { ...tournamentInput, endsOn: '', venueId: 'new', newVenue: { ...venueInput, city: '' } },
        meta,
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { fields: { endsOn: 'required', 'newVenue.city': 'required' } },
    });
    expect(await prisma.venue.count()).toBe(0);

    const tournament = await createTournament(
      admin,
      { ...tournamentInput, venueId: 'new', newVenue: venueInput },
      meta,
    );
    const venue = await prisma.venue.findFirstOrThrow({ include: { courts: true } });
    expect(tournament.venueId).toBe(venue.id);
    expect(venue.courts).toHaveLength(6);
  });

  it("can't archive a venue with an upcoming tournament", async () => {
    const admin = await newAdmin();
    const venue = await createVenue(admin, venueInput, meta);
    await createTournament(admin, { ...tournamentInput, venueId: venue.id }, meta);
    await expect(setVenueArchived(admin, venue.id, true, meta)).rejects.toMatchObject({
      code: 'inUse',
    });
  });

  it('is admin-only', async () => {
    const player = await actorFor((await createPlayer()).userId);
    await expect(createVenue(player, venueInput, meta)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('tournaments', () => {
  it('requires an organiser email for third-party tournaments', async () => {
    const admin = await newAdmin();
    await expect(
      createTournament(admin, { ...tournamentInput, type: 'THIRD_PARTY' }, meta),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { fields: { organiserEmail: 'organiserEmailRequired' } },
    });
  });

  it('delegates to an existing account and limits what the organiser sees', async () => {
    const admin = await newAdmin();
    const organiser = await createPlayer({ email: 'org@example.test' });
    const theirs = await createTournament(
      admin,
      { ...tournamentInput, type: 'THIRD_PARTY', organiserEmail: 'ORG@example.test' },
      meta,
    );
    const other = await createTournament(admin, { ...tournamentInput, name: 'Other Cup' }, meta);
    expect(theirs.slug).toBe('utrecht-open-2027');

    const orgActor = await actorFor(organiser.userId);
    expect(orgActor.roles).toContain('ORGANISER');
    expect((await listTournaments(orgActor)).tournaments.map((t) => t.id)).toEqual([theirs.id]);
    await expect(getTournament(orgActor, other.id)).rejects.toMatchObject({ code: 'notFound' });

    // Organisers edit details but can't change the type or create tournaments.
    await updateTournament(
      orgActor,
      theirs.id,
      { ...tournamentInput, name: 'Utrecht Open XL', type: 'SELF' },
      meta,
    );
    const updated = await prisma.tournament.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(updated).toMatchObject({ name: 'Utrecht Open XL', type: 'THIRD_PARTY' });
    await expect(createTournament(orgActor, tournamentInput, meta)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('turns an invite into organiser rights when that email signs up', async () => {
    const admin = await newAdmin();
    const t = await createTournament(
      admin,
      { ...tournamentInput, type: 'THIRD_PARTY', organiserEmail: 'new.org@example.test' },
      meta,
    );
    expect(await prisma.organiserInvite.count({ where: { acceptedAt: null } })).toBe(1);

    const { userId } = await createPlayer({ email: 'new.org@example.test' });
    const orgActor = await actorFor(userId);
    expect(orgActor.roles).toContain('ORGANISER');
    expect((await getTournament(orgActor, t.id)).id).toBe(t.id);
    expect(await prisma.organiserInvite.count({ where: { acceptedAt: null } })).toBe(0);
  });

  it('also accepts invites on login for existing accounts invited later', async () => {
    const admin = await newAdmin();
    const player = await createPlayer({ email: 'later@example.test' });
    const t = await createTournament(admin, tournamentInput, meta);
    // Simulate an invite created before the account existed (race with sign-up).
    await prisma.organiserInvite.create({
      data: { tournamentId: t.id, email: 'later@example.test' },
    });
    await authenticate({ identifier: 'later@example.test', password: player.password }, meta);
    expect(
      await prisma.tournamentOrganiser.count({
        where: { tournamentId: t.id, userId: player.userId },
      }),
    ).toBe(1);
  });

  it('follows the status workflow and needs an event before opening', async () => {
    const admin = await newAdmin();
    const t = await createTournament(admin, tournamentInput, meta);
    await expect(
      changeTournamentStatus(admin, t.id, { status: 'OPEN' }, meta),
    ).rejects.toMatchObject({ code: 'noOpenEvents' });
    await createEvent(admin, t.id, { discipline: 'HE', fee: '12,50', drawType: 'KNOCKOUT' }, meta);
    await changeTournamentStatus(admin, t.id, { status: 'OPEN' }, meta);
    await expect(
      changeTournamentStatus(admin, t.id, { status: 'FINISHED' }, meta),
    ).rejects.toMatchObject({ code: 'statusTransition' });
    expect(await prisma.auditLog.count({ where: { action: 'tournament.status' } })).toBe(1);
  });

  it('organisers can be added later by an admin', async () => {
    const admin = await newAdmin();
    const t = await createTournament(admin, tournamentInput, meta);
    expect(await addOrganiser(admin, t.id, { email: 'nobody@example.test' }, meta)).toEqual({
      linked: false,
    });
  });
});

describe('events', () => {
  it('rejects duplicates and stores the fee in cents', async () => {
    const admin = await newAdmin();
    const t = await createTournament(admin, tournamentInput, meta);
    const e = await createEvent(
      admin,
      t.id,
      {
        discipline: 'GD',
        fee: '€ 10,00',
        drawType: 'GROUPS_KNOCKOUT',
        groupSize: '4',
        advancePerGroup: '2',
      },
      meta,
    );
    expect(e).toMatchObject({ feeCents: 1000, groupSize: 4, advancePerGroup: 2 });
    await expect(
      createEvent(admin, t.id, { discipline: 'GD', fee: '8', drawType: 'KNOCKOUT' }, meta),
    ).rejects.toMatchObject({
      code: 'duplicateEvent',
    });
    const updated = await updateEvent(
      admin,
      t.id,
      e.id,
      { discipline: 'GD', fee: '9', drawType: 'SWISS' },
      meta,
    );
    expect(updated).toMatchObject({ feeCents: 900, drawType: 'SWISS', groupSize: null });
    await deleteEvent(admin, t.id, e.id, meta);
    expect((await getTournament(admin, t.id)).events).toHaveLength(0);
  });
});

describe('players', () => {
  it('adds a player without account; a later sign-up with that email claims the profile', async () => {
    const admin = await newAdmin();
    const added = await adminCreatePlayer(
      admin,
      {
        firstName: 'Iris',
        lastName: 'Bakker',
        contactEmail: 'iris@example.test',
        dateOfBirth: '2000-02-02',
        gender: 'FEMALE',
        federationId: 'NL123',
      },
      meta,
    );
    await expect(
      adminCreatePlayer(
        admin,
        {
          firstName: 'X',
          lastName: 'Y',
          contactEmail: 'iris@example.test',
          dateOfBirth: '2000-01-01',
          gender: 'MALE',
        },
        meta,
      ),
    ).rejects.toMatchObject({ details: { fields: { contactEmail: 'emailTaken' } } });

    const signedUp = await signUp(
      {
        firstName: 'Iris',
        lastName: 'Bakker',
        email: 'iris@example.test',
        phone: '0611111111',
        password: 'Shuttle-Smash-2027',
        dateOfBirth: '2000-02-02',
        gender: 'FEMALE',
        locale: 'nl',
        acceptTerms: true,
        acceptPrivacy: true,
      },
      meta,
    );
    expect(signedUp.memberNumber).toBe(added.memberNumber);
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { id: added.id } });
    expect(profile).toMatchObject({
      userId: signedUp.userId,
      federationId: 'NL123',
      contactEmail: null,
    });
  });

  it('merges a duplicate into the player that stays', async () => {
    const admin = await newAdmin(Role.OWNER); // merge and export: owners (D80)
    const withAccount = await createPlayer({ firstName: 'Tim' });
    const duplicate = await adminCreatePlayer(
      admin,
      {
        firstName: 'Tim',
        lastName: 'Dup',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
        federationId: 'NL999',
      },
      meta,
    );
    const target = await prisma.playerProfile.findUniqueOrThrow({
      where: { userId: withAccount.userId },
    });

    await expect(
      mergePlayers(
        admin,
        { sourceId: duplicate.id, targetMemberNumber: duplicate.memberNumber },
        meta,
      ),
    ).rejects.toMatchObject({
      code: 'mergeSelf',
    });
    await mergePlayers(
      admin,
      { sourceId: duplicate.id, targetMemberNumber: target.memberNumber.toLowerCase() },
      meta,
    );

    const after = await prisma.playerProfile.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.federationId).toBe('NL999');
    const source = await prisma.playerProfile.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(source).toMatchObject({ mergedIntoId: target.id });
    expect(source.deletedAt).not.toBeNull();
    expect((await listPlayers(admin, { q: 'Dup' })).total).toBe(0);
  });

  it('imports CSV (create, update, line errors) and exports for Excel', async () => {
    const admin = await newAdmin(Role.OWNER); // merge and export: owners (D80)
    await prisma.club.create({ data: { name: 'BC Utrecht Smash', slug: 'bc-utrecht-smash' } });
    const csv = [
      'firstName;lastNamePrefix;lastName;email;phone;dateOfBirth;gender;club;federationId;preferredEvents',
      'Anna;;Peters;anna@example.test;06 1234 5678;1990-05-05;female;BC Utrecht Smash;NL555;DE DD',
      'Bram;de;Wit;;;1985-13-01;MALE;;;HE',
      'Anna;;Peters-Updated;anna@example.test;;1990-05-05;FEMALE;;NL555;DE',
    ].join('\r\n');
    const result = await importPlayersCsv(admin, csv, meta);
    expect(result).toMatchObject({ created: 1, updated: 1, skipped: 1 });
    expect(result.errors).toEqual([{ line: 3, field: 'dateOfBirth', error: 'dateInvalid' }]);

    const anna = await prisma.playerProfile.findFirstOrThrow({
      where: { federationId: 'NL555' },
      include: { club: true },
    });
    // Empty cells (phone, club) keep the stored values.
    expect(anna).toMatchObject({
      lastName: 'Peters-Updated',
      phone: '+31612345678',
      preferredDisciplines: ['DE'],
    });
    expect(anna.club?.name).toBe('BC Utrecht Smash');

    const exported = await exportPlayersCsv(admin, { q: 'anna' });
    expect(exported.startsWith('\uFEFFmemberNumber;firstName')).toBe(true);
    expect(exported).toContain('anna@example.test');
  });

  it('exports Excel and imports Excel files (template, date serials, lost leading zeros)', async () => {
    const admin = await newAdmin(Role.OWNER); // merge and export: owners (D80)
    const template = await importPlayersFile(admin, playerXlsxTemplate(), meta);
    expect(template).toMatchObject({ created: 1, skipped: 0 });

    // What Excel saves after a user types a date and a phone number into the template.
    const typed = toXlsx(
      'Blad1',
      ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender'],
      [['Lotte', 'Bakker', 'lotte@example.test', 612345678, 33000, 'FEMALE'], []],
    );
    const result = await importPlayersFile(admin, typed, meta);
    expect(result).toMatchObject({ created: 1, skipped: 0, errors: [] });
    const lotte = await prisma.playerProfile.findFirstOrThrow({ where: { lastName: 'Bakker' } });
    expect(lotte.dateOfBirth.toISOString().slice(0, 10)).toBe('1990-05-07');
    expect(lotte.phone).toBe('+31612345678');

    const grid = readXlsx(await exportPlayersXlsx(admin, { q: 'lotte' }));
    expect(grid?.[0]?.slice(0, 2)).toEqual(['memberNumber', 'firstName']);
    expect(grid?.[1]).toContain('lotte@example.test');
    expect(grid).toHaveLength(2);

    // Gender "other" is no longer accepted.
    const other = await importPlayersCsv(
      admin,
      'firstName;lastName;dateOfBirth;gender\nSam;Smit;2000-01-01;OTHER',
      meta,
    );
    expect(other.errors).toEqual([{ line: 2, field: 'gender', error: 'required' }]);
  });

  it('rejects files that are not player CSVs', async () => {
    const admin = await newAdmin();
    await expect(importPlayersCsv(admin, 'foo,bar\n1,2', meta)).rejects.toMatchObject({
      code: 'csvInvalid',
    });
    // A zip that is not a workbook.
    const notWorkbook = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(importPlayersFile(admin, notWorkbook, meta)).rejects.toMatchObject({
      code: 'csvInvalid',
    });
  });
});
