import { playerEligibility } from '@tourneasy/shared/rules';
import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import { readXlsx, toXlsx } from '../lib/xlsx';
import { authenticate, signUp } from './auth-service';
import { invitedEmailFromNext } from './invite-address';
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
  mergePreview,
  recentPlayerImports,
  undoPlayerImport,
} from './player-service';
import { actorFromWebToken, createWebSession, type Actor } from './session-service';
import {
  acceptOrganiserInviteByLink,
  addOrganiser,
  changeTournamentStatus,
  createTournament,
  getTournament,
  listTournaments,
  organiserInviteByToken,
  tournamentOver,
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
    await prisma.user.update({
      where: { id: organiser.userId },
      data: { emailVerifiedAt: new Date() },
    });
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

  it('emails an invitation link; rights only for the confirmed address (D102)', async () => {
    const admin = await newAdmin();
    const t = await createTournament(
      admin,
      { ...tournamentInput, type: 'THIRD_PARTY', organiserEmail: 'new.org@example.test' },
      meta,
    );
    expect(await prisma.organiserInvite.count({ where: { acceptedAt: null } })).toBe(1);
    const link = lastMailTo('new.org@example.test').link!;
    expect(link).toContain('/organiser-invites/');
    const token = link.split('/organiser-invites/')[1]!.split(/[?#\s]/)[0]!;
    expect(await organiserInviteByToken(token)).toMatchObject({
      email: 'new.org@example.test',
      tournament: t.name,
    });

    // Someone signs up with that address but hasn't confirmed it: no rights yet.
    const { userId } = await createPlayer({ email: 'new.org@example.test' });
    expect((await actorFor(userId)).roles).not.toContain('ORGANISER');
    // Another account can't use the link.
    const stranger = await createPlayer({ email: 'stranger@example.test' });
    await expect(
      acceptOrganiserInviteByLink(await actorFor(stranger.userId), token, meta),
    ).rejects.toMatchObject({ code: 'forbidden' });

    // The link proves the address: confirmed, and the rights apply.
    expect(await acceptOrganiserInviteByLink(await actorFor(userId), token, meta)).toBe(1);
    const orgActor = await actorFor(userId);
    expect(orgActor.roles).toContain('ORGANISER');
    expect((await getTournament(orgActor, t.id)).id).toBe(t.id);
    expect(await prisma.organiserInvite.count({ where: { acceptedAt: null } })).toBe(0);
    expect(await organiserInviteByToken(token)).toBeNull();
  });

  it('signing up through the organiser link confirms the address and gives the rights (D102)', async () => {
    const admin = await newAdmin();
    const t = await createTournament(
      admin,
      { ...tournamentInput, type: 'THIRD_PARTY', organiserEmail: 'club.org@example.test' },
      meta,
    );
    const token = lastMailTo('club.org@example.test')
      .link!.split('/organiser-invites/')[1]!
      .split(/[?#\s]/)[0]!;
    const invitedEmail = await invitedEmailFromNext(`/en/organiser-invites/${token}`);
    expect(invitedEmail).toBe('club.org@example.test');
    const { userId } = await signUp(
      {
        firstName: 'Carla',
        lastName: 'Club',
        email: 'club.org@example.test',
        phone: '+31612345678',
        password: 'Shuttle-Smash-2027',
        dateOfBirth: '1980-01-01',
        gender: 'FEMALE',
        acceptTerms: true,
        acceptPrivacy: true,
      },
      meta,
      { invitedEmail },
    );
    const orgActor = await actorFor(userId);
    expect(orgActor.emailVerified).toBe(true);
    expect(await prisma.tournamentOrganiser.count({ where: { tournamentId: t.id, userId } })).toBe(
      1,
    );
  });

  it('also accepts invites on login for existing accounts invited later', async () => {
    const admin = await newAdmin();
    const player = await createPlayer({ email: 'later@example.test' });
    await prisma.user.update({
      where: { id: player.userId },
      data: { emailVerifiedAt: new Date() },
    });
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

  it('can step back from In progress and Finished (D99)', async () => {
    const admin = await newAdmin();
    const t = await createTournament(admin, tournamentInput, meta);
    await prisma.tournament.update({ where: { id: t.id }, data: { status: 'FINISHED' } });
    await changeTournamentStatus(admin, t.id, { status: 'IN_PROGRESS' }, meta);
    await changeTournamentStatus(admin, t.id, { status: 'CLOSED' }, meta);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
      'CLOSED',
    );
  });

  it('archives only after the end date (D86)', async () => {
    const admin = await newAdmin();
    const t = await createTournament(admin, tournamentInput, meta); // still to come
    await expect(
      changeTournamentStatus(admin, t.id, { status: 'ARCHIVED' }, meta),
    ).rejects.toMatchObject({ code: 'archiveTooEarly' });
    await prisma.tournament.update({
      where: { id: t.id },
      data: { startsOn: new Date('2020-03-14'), endsOn: new Date('2020-03-15') },
    });
    await changeTournamentStatus(admin, t.id, { status: 'ARCHIVED' }, meta);
    expect(tournamentOver(new Date('2027-03-14'), new Date('2027-03-14T22:30:00Z'))).toBe(false);
    expect(tournamentOver(new Date('2027-03-14'), new Date('2027-03-14T23:30:00Z'))).toBe(true);
  });

  it('archives a tournament that ended while still Closed (D91)', async () => {
    const admin = await newAdmin();
    const t = await createTournament(admin, tournamentInput, meta);
    await prisma.tournament.update({ where: { id: t.id }, data: { status: 'CLOSED' } });
    await expect(
      changeTournamentStatus(admin, t.id, { status: 'ARCHIVED' }, meta),
    ).rejects.toMatchObject({ code: 'archiveTooEarly' });
    await prisma.tournament.update({
      where: { id: t.id },
      data: { startsOn: new Date('2020-03-14'), endsOn: new Date('2020-03-15') },
    });
    await changeTournamentStatus(admin, t.id, { status: 'ARCHIVED' }, meta);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
      'ARCHIVED',
    );
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
    // The check shows both side by side before anything changes (D100).
    const preview = await mergePreview(admin, {
      sourceId: duplicate.id,
      targetMemberNumber: target.memberNumber,
    });
    expect(preview.source).toMatchObject({ name: 'Tim Dup', hasAccount: false, entries: 0 });
    expect(preview.target).toMatchObject({ memberNumber: target.memberNumber, hasAccount: true });
    expect(await prisma.playerProfile.count({ where: { mergedIntoId: { not: null } } })).toBe(0);
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

  it('lists players 25, 50, 75 or 100 per page (D104)', async () => {
    const admin = await newAdmin();
    await prisma.playerProfile.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        memberNumber: `TE8${String(i).padStart(5, '0')}`,
        firstName: 'Page',
        lastName: `Player${i}`,
        gender: 'MALE' as const,
      })),
    });
    expect(await listPlayers(admin, {})).toMatchObject({ pages: 3 });
    const fifty = await listPlayers(admin, { perPage: 50 });
    expect(fifty).toMatchObject({ pages: 2 });
    expect(fifty.players).toHaveLength(50);
    // Any other size falls back to 25.
    expect((await listPlayers(admin, { perPage: 5000 })).players).toHaveLength(25);
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
    expect(lotte.dateOfBirth!.toISOString().slice(0, 10)).toBe('1990-05-07');
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

  it('imports players without a date of birth; only age-limited events need it (D95)', async () => {
    const admin = await newAdmin();
    const file = toXlsx(
      'Blad1',
      ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender', 'preferredEvents'],
      [['Ravi', 'Kumar', 'ravi@example.test', '+919876543210', '', 'MALE', 'HD GD']],
    );
    expect(await importPlayersFile(admin, file, meta)).toMatchObject({ created: 1, errors: [] });
    const ravi = await prisma.playerProfile.findFirstOrThrow({ where: { lastName: 'Kumar' } });
    expect(ravi.dateOfBirth).toBeNull();
    expect(ravi.isMinor).toBe(false);
    expect(ravi.preferredDisciplines).toEqual(['HD', 'GD']);
    // Senior (no age limit) is fine; an age-limited category needs the date of birth.
    const unknownAge = {
      gender: 'MALE' as const,
      dateOfBirth: null,
      levelRank: { singles: null, doubles: null, mixed: null },
    };
    type Category = { minAge: number | null; maxAge: number | null } & {
      referenceMonth: number;
      referenceDay: number;
    };
    const senior: Category = { minAge: null, maxAge: null, referenceMonth: 1, referenceDay: 1 };
    const veterans: Category = { minAge: 35, maxAge: null, referenceMonth: 1, referenceDay: 1 };
    const on = new Date('2027-03-01');
    const event = (ageCategory: Category | null) =>
      ({ discipline: 'HD', ageCategory, levelRank: null }) as const;
    expect(playerEligibility(unknownAge, event(senior), on)).toEqual([]);
    expect(playerEligibility(unknownAge, event(null), on)).toEqual([]);
    expect(playerEligibility(unknownAge, event(veterans), on)).toEqual(['birthDateUnknown']);
  });

  it('undoes an import, keeping players already in use (D100)', async () => {
    const admin = await newAdmin();
    const file = toXlsx(
      'Blad1',
      ['firstName', 'lastName', 'email', 'gender'],
      [
        ['Una', 'One', 'una@example.test', 'FEMALE'],
        ['Duo', 'Two', 'duo@example.test', 'MALE'],
        ['Tre', 'Three', 'tre@example.test', 'MALE'],
      ],
    );
    await importPlayersFile(admin, file, meta);
    // One of them got an account in the meantime: in use, so it stays.
    const user = await prisma.user.create({ data: { email: 'duo@example.test', name: 'Duo Two' } });
    await prisma.playerProfile.updateMany({
      where: { lastName: 'Two' },
      data: { userId: user.id },
    });

    const [latest] = await recentPlayerImports(admin);
    expect(latest).toMatchObject({ created: 3, canUndo: true, removable: 2, undone: false });
    expect(await undoPlayerImport(admin, latest!.id, meta)).toEqual({ removed: 2, kept: 1 });
    expect(
      (
        await prisma.playerProfile.findMany({
          where: { lastName: { in: ['One', 'Two', 'Three'] } },
        })
      ).map((p) => p.lastName),
    ).toEqual(['Two']);
    expect((await recentPlayerImports(admin))[0]).toMatchObject({ undone: true, canUndo: false });
    await expect(undoPlayerImport(admin, latest!.id, meta)).rejects.toMatchObject({
      code: 'statusTransition',
    });
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
