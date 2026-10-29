import { prisma, Role } from '@tourneasy/db';
import { toCsv } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { toXlsx } from '../lib/xlsx';
import {
  addEntryAsOrganiser,
  importTournamentEntries,
  searchPlayersForEntry,
} from './entry-import-service';
import { exportTournamentEntries } from './registration-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function player(overrides: Record<string, unknown> = {}, role?: Role) {
  const p = await createPlayer(overrides);
  if (role) await prisma.userRole.create({ data: { userId: p.userId, role } });
  const actor = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
  const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: p.userId } });
  return { ...p, actor, profile };
}

async function setup() {
  const t = await prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-11-01T08:00:00Z'),
      registrationClosesAt: new Date('2027-02-27T22:59:00Z'),
      entryDeadline: new Date('2027-02-27T22:59:00Z'),
      withdrawalDeadline: new Date('2027-02-20T22:59:00Z'),
      maxEventsPerPlayer: 1,
    },
  });
  const de = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'DE', feeCents: 1500, maxEntries: 2 },
  });
  const gd = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'GD', feeCents: 0 },
  });
  return { t, de, gd };
}

const csv2 = (header: string[], rows: string[][]) => new TextEncoder().encode(toCsv(header, rows));
const admin = async () => (await player({}, Role.ADMIN)).actor;

const csv = (rows: string[][]) =>
  new TextEncoder().encode(
    toCsv(['event', 'memberNumber', 'email', 'partnerMemberNumber', 'partnerEmail'], rows),
  );

describe('importing participants', () => {
  it("is for the tournament's organisers and admins only", async () => {
    const { t } = await setup();
    const anna = await player();
    await expect(importTournamentEntries(anna.actor, t.id, csv([]), meta)).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('enters players and pairs, waitlists when full and reports bad rows', async () => {
    const { t, de, gd } = await setup();
    const admin = await player({}, Role.ADMIN);
    const [a, b, c] = [await player(), await player(), await player()];
    const bram = await player({ gender: 'MALE' });
    const result = await importTournamentEntries(
      admin.actor,
      t.id,
      csv([
        ['Damesenkel', a.profile.memberNumber, '', '', ''],
        ['damesenkel', '', b.email, '', ''],
        ["Women's singles", c.profile.memberNumber, '', '', ''],
        ['Gemengd dubbel', a.profile.memberNumber, '', '', bram.email],
        ['Damesenkel', a.profile.memberNumber, '', '', ''],
        ['Herenenkel', a.profile.memberNumber, '', '', ''],
        ['Damesenkel', 'TE999999', '', '', ''],
        ['Damesenkel', bram.profile.memberNumber, '', '', ''],
      ]),
      meta,
    );
    expect(result).toMatchObject({ created: 3, waitlisted: 1, skipped: 4 });
    expect(result.errors.map((e) => [e.line, e.error])).toEqual([
      [7, 'eventNotFound'],
      [6, 'alreadyEntered'],
      [8, 'playerNotFound'],
      [9, 'notEligible'],
    ]);
    const pair = await prisma.registration.findFirstOrThrow({
      where: { eventId: gd.id },
      include: { participants: true },
    });
    expect(pair.participants.map((p) => p.paymentStatus)).toEqual(['WAIVED', 'WAIVED']);
    expect(
      await prisma.registration.count({ where: { eventId: de.id, status: 'WAITLISTED' } }),
    ).toBe(1);
  });

  it('takes the participants export back (Excel), skipping what is already there', async () => {
    const { t } = await setup();
    const admin = await player({}, Role.ADMIN);
    const anna = await player();
    const bram = await player({ gender: 'MALE' });
    await importTournamentEntries(
      admin.actor,
      t.id,
      csv([['Gemengd dubbel', anna.profile.memberNumber, '', bram.profile.memberNumber, '']]),
      meta,
    );
    const exported = await exportTournamentEntries(admin.actor, t.id, {}, 'nl');
    // Into a second tournament with the same events: the pair comes across as one entry.
    const second = await prisma.tournament.create({
      data: {
        ...(await prisma.tournament.findUniqueOrThrow({
          where: { id: t.id },
          select: {
            name: true,
            startsOn: true,
            endsOn: true,
            registrationOpensAt: true,
            registrationClosesAt: true,
            entryDeadline: true,
            withdrawalDeadline: true,
          },
        })),
        slug: 'second',
      },
    });
    await prisma.tournamentEvent.create({
      data: { tournamentId: second.id, discipline: 'GD', feeCents: 1000 },
    });
    const result = await importTournamentEntries(
      admin.actor,
      second.id,
      toXlsx('Deelnemers', exported.header, exported.rows),
      meta,
    );
    expect(result).toMatchObject({ created: 1, skipped: 0 });
    const pair = await prisma.registration.findFirstOrThrow({
      where: { event: { tournamentId: second.id } },
      include: { participants: { orderBy: { role: 'asc' } } },
    });
    expect(pair.participants.map((p) => [p.role, p.paymentStatus])).toEqual([
      ['PRIMARY', 'UNPAID'],
      ['PARTNER', 'UNPAID'],
    ]);
    // Importing the same file again changes nothing.
    const again = await importTournamentEntries(
      admin.actor,
      second.id,
      toXlsx('Deelnemers', exported.header, exported.rows),
      meta,
    );
    expect(again).toMatchObject({ created: 0, skipped: 1 });
  });
});

describe('one-step import and add-entry screen (D63)', () => {
  const header = [
    'event',
    'firstName',
    'lastName',
    'gender',
    'dateOfBirth',
    'email',
    'partnerFirstName',
    'partnerLastName',
    'partnerGender',
    'partnerDateOfBirth',
  ];

  it('creates missing players from the file and enters the pairs, once', async () => {
    const { t, gd } = await setup();
    const actor = await admin();
    const file = csv2(header, [
      [
        'Gemengd dubbel',
        'Kees',
        'Visser',
        'M',
        '12-04-1990',
        'kees@example.test',
        'Anna',
        'Bos',
        'V',
        '1992-08-01',
      ],
      [
        'Gemengd dubbel',
        'Piet',
        'Smit',
        'man',
        '1985-01-01',
        '',
        'Ria',
        'Smit',
        'vrouw',
        '1987-03-03',
      ],
    ]);
    const first = await importTournamentEntries(actor, t.id, file, meta);
    expect(first).toMatchObject({ created: 2, skipped: 0, newPlayers: 4 });
    expect(first.rows[0]).toMatchObject({ name: 'Kees Visser / Anna Bos', outcome: 'created' });
    expect(first.rows[0]!.newPlayers).toHaveLength(2);
    expect(await prisma.registration.count({ where: { eventId: gd.id } })).toBe(2);

    // The same file again: players are recognised (name + date of birth), entries not doubled.
    const again = await importTournamentEntries(actor, t.id, file, meta);
    expect(again).toMatchObject({ created: 0, newPlayers: 0, skipped: 2 });
    expect(again.rows.map((r) => r.error)).toEqual(['alreadyEntered', 'alreadyEntered']);
    expect(await prisma.playerProfile.count({ where: { lastName: 'Smit' } })).toBe(2);
  });

  it('lets a tournament organiser add a pair by hand, with a new player', async () => {
    const { t, gd } = await setup();
    const organiser = await createPlayer();
    await prisma.userRole.create({ data: { userId: organiser.userId, role: Role.ORGANISER } });
    await prisma.tournamentOrganiser.create({
      data: { tournamentId: t.id, userId: organiser.userId },
    });
    const actor = (await actorFromWebToken(
      (await createWebSession(organiser.userId, meta, true)).token,
    ))!;
    const bram = await createPlayer({ firstName: 'Bram', lastName: 'Jansen', gender: 'MALE' });
    const bramProfile = await prisma.playerProfile.findUniqueOrThrow({
      where: { userId: bram.userId },
    });

    // The partner search only offers women for a man in mixed doubles.
    await createPlayer({ firstName: 'Lotte', lastName: 'Jansen', gender: 'FEMALE' });
    const options = await searchPlayersForEntry(
      actor,
      t.id,
      gd.id,
      'jansen',
      bramProfile.memberNumber,
    );
    expect(options.map((o) => o.name)).toEqual(['Lotte Jansen']);

    const added = await addEntryAsOrganiser(
      actor,
      t.id,
      {
        eventId: gd.id,
        player: { memberNumber: bramProfile.memberNumber },
        partner: {
          new: {
            firstName: 'Noor',
            lastName: 'Peters',
            gender: 'FEMALE',
            dateOfBirth: '1999-02-02',
          },
        },
      },
      meta,
    );
    expect(added).toMatchObject({ status: 'CONFIRMED', name: 'Bram Jansen / Noor Peters' });
    await expect(
      addEntryAsOrganiser(
        actor,
        t.id,
        { eventId: gd.id, player: { memberNumber: bramProfile.memberNumber } },
        meta,
      ),
    ).rejects.toMatchObject({ details: { fields: { partner: 'partnerRequired' } } });
  });

  it('warns before adding a new player with the name of an existing one (D82)', async () => {
    const actor = await admin();
    const { t, gd } = await setup();
    const bram = await player({ firstName: 'Bram', lastName: 'Jansen', gender: 'MALE' });
    // An existing Noor Peters, born 1999-02-02.
    await player({
      firstName: 'Noor',
      lastName: 'Peters',
      gender: 'FEMALE',
      dateOfBirth: '1999-02-02',
    });
    const add = (dateOfBirth: string, allowNew = false) =>
      addEntryAsOrganiser(
        actor,
        t.id,
        {
          eventId: gd.id,
          player: { memberNumber: bram.profile.memberNumber },
          partner: {
            new: { firstName: 'noor', lastName: 'PETERS', gender: 'FEMALE', dateOfBirth },
          },
          allowNew,
        },
        meta,
      );
    const count = () =>
      prisma.playerProfile.count({
        where: { lastName: { equals: 'peters', mode: 'insensitive' } },
      });

    // Another date of birth: maybe a typo, maybe a namesake. Ask first.
    await expect(add('1999-03-03')).rejects.toMatchObject({
      code: 'possibleDuplicate',
      details: { duplicates: { player: [], partner: [{ name: 'Noor Peters', born: 1999 }] } },
    });
    expect(await count()).toBe(1);
    // "Add anyway" creates the namesake.
    await add('1999-03-03', true);
    expect(await count()).toBe(2);
  });
});
