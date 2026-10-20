/**
 * Development seed: 1 admin, 20 players, 3 clubs, 3 venues, 2 tournaments with events.
 * Wipes all data first — refuses to run in production.
 *
 * Federation values (age categories, levels) are placeholders; see DECISIONS.md D10.
 */
import { hash } from '@node-rs/argon2';
import {
  ConsentType,
  Discipline,
  DrawType,
  Gender,
  Locale,
  PrismaClient,
  Province,
  Role,
  TournamentStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const POLICY_VERSION = '2026-10';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}

/** Date at 00:00 UTC, `days` from today — used for @db.Date columns. */
function dateInDays(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Timestamp at 23:59 Europe/Amsterdam (approximated as 22:59 UTC), `days` from today. */
function deadlineInDays(days: number): Date {
  const d = dateInDays(days);
  d.setUTCHours(22, 59, 0, 0);
  return d;
}

function dobYearsAgo(years: number, dayOffset: number): Date {
  const d = new Date(Date.UTC(new Date().getUTCFullYear() - years, 0, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d;
}

async function nextMemberNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<{ value: bigint }[]>`
    SELECT nextval('member_number_seq') AS value`;
  return `TE${rows[0]!.value.toString()}`;
}

async function wipe(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }
  await prisma.$executeRawUnsafe('ALTER SEQUENCE member_number_seq RESTART WITH 100001');
  await prisma.$executeRawUnsafe('ALTER SEQUENCE order_number_seq RESTART WITH 1');
}

const t = (nl: string, en: string) => ({ nl, en });

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@tourneasy.test';
  const adminPasswordHash = await hash(requireEnv('SEED_ADMIN_PASSWORD'));
  const playerPasswordHash = await hash(requireEnv('SEED_PLAYER_PASSWORD'));

  await wipe();

  // ── Configuration: age categories & levels ────────────────────────────────
  const ageCategoryData = [
    { code: 'U11', name: t('Onder 11', 'Under 11'), maxAge: 10, sortOrder: 1 },
    { code: 'U13', name: t('Onder 13', 'Under 13'), maxAge: 12, sortOrder: 2 },
    { code: 'U15', name: t('Onder 15', 'Under 15'), maxAge: 14, sortOrder: 3 },
    { code: 'U17', name: t('Onder 17', 'Under 17'), maxAge: 16, sortOrder: 4 },
    { code: 'U19', name: t('Onder 19', 'Under 19'), maxAge: 18, sortOrder: 5 },
    { code: 'SENIOR', name: t('Senioren', 'Senior'), sortOrder: 6 },
    { code: 'V35', name: t('Veteranen 35+', 'Veterans 35+'), minAge: 35, sortOrder: 7 },
    { code: 'V45', name: t('Veteranen 45+', 'Veterans 45+'), minAge: 45, sortOrder: 8 },
  ];
  await prisma.ageCategory.createMany({ data: ageCategoryData });
  const ages = Object.fromEntries(
    (await prisma.ageCategory.findMany()).map((a) => [a.code, a.id]),
  ) as Record<string, string>;

  await prisma.levelClass.createMany({
    data: ['A', 'B', 'C', 'D'].map((code, i) => ({
      code,
      name: t(`Niveau ${code}`, `Level ${code}`),
      rank: i + 1,
    })),
  });
  const levels = Object.fromEntries(
    (await prisma.levelClass.findMany()).map((l) => [l.code, l.id]),
  ) as Record<string, string>;

  // ── Venues & courts ───────────────────────────────────────────────────────
  const venueData = [
    {
      name: 'Sporthal De Shuttle',
      slug: 'sporthal-de-shuttle-utrecht',
      street: 'Shuttleweg',
      houseNumber: '12',
      postcode: '3511 AB',
      city: 'Utrecht',
      province: Province.UTRECHT,
      latitude: 52.0907,
      longitude: 5.1214,
      numberOfCourts: 9,
      parkingInfo: t('Gratis parkeren naast de hal.', 'Free parking next to the hall.'),
      publicTransportInfo: t(
        '10 minuten lopen vanaf Utrecht Centraal.',
        '10 min walk from Utrecht Centraal.',
      ),
    },
    {
      name: 'Badmintoncentrum Amstel',
      slug: 'badmintoncentrum-amstel-amsterdam',
      street: 'Amstelkade',
      houseNumber: '88',
      postcode: '1078 AL',
      city: 'Amsterdam',
      province: Province.NOORD_HOLLAND,
      latitude: 52.3508,
      longitude: 4.9047,
      numberOfCourts: 12,
      parkingInfo: t('Betaald parkeren in de garage.', 'Paid parking in the garage.'),
      publicTransportInfo: t('Tram 4, halte Amstelkade.', 'Tram 4, stop Amstelkade.'),
    },
    {
      name: 'Sportcentrum Eindhoven Noord',
      slug: 'sportcentrum-eindhoven-noord',
      street: 'Smashlaan',
      houseNumber: '3',
      postcode: '5627 AA',
      city: 'Eindhoven',
      province: Province.NOORD_BRABANT,
      latitude: 51.4697,
      longitude: 5.4725,
      numberOfCourts: 7,
      parkingInfo: t('Ruime gratis parkeerplaats.', 'Large free car park.'),
      publicTransportInfo: t(
        'Bus 403 vanaf Eindhoven Centraal.',
        'Bus 403 from Eindhoven Centraal.',
      ),
    },
  ];
  const venues = [];
  for (const v of venueData) {
    const venue = await prisma.venue.create({
      data: {
        ...v,
        facilities: t('Kleedkamers, douches, kantine', 'Changing rooms, showers, canteen'),
        courts: {
          create: Array.from({ length: v.numberOfCourts }, (_, i) => ({ number: i + 1 })),
        },
      },
    });
    venues.push(venue);
  }
  const [utrecht, amsterdam, eindhoven] = venues as [
    (typeof venues)[number],
    (typeof venues)[number],
    (typeof venues)[number],
  ];

  // ── Clubs ─────────────────────────────────────────────────────────────────
  const clubs = await Promise.all([
    prisma.club.create({
      data: {
        name: 'BC Utrecht Smash',
        slug: 'bc-utrecht-smash',
        city: 'Utrecht',
        province: Province.UTRECHT,
        venueId: utrecht.id,
      },
    }),
    prisma.club.create({
      data: {
        name: 'BV Amstel Shuttles',
        slug: 'bv-amstel-shuttles',
        city: 'Amsterdam',
        province: Province.NOORD_HOLLAND,
        venueId: amsterdam.id,
      },
    }),
    prisma.club.create({
      data: {
        name: 'BC Eindhoven Drop',
        slug: 'bc-eindhoven-drop',
        city: 'Eindhoven',
        province: Province.NOORD_BRABANT,
        venueId: eindhoven.id,
      },
    }),
  ]);

  // ── Admin ─────────────────────────────────────────────────────────────────
  const now = new Date();
  await prisma.user.create({
    data: {
      email: adminEmail,
      name: 'Tourneasy Admin',
      passwordHash: adminPasswordHash,
      emailVerifiedAt: now,
      locale: Locale.nl,
      roles: { create: [{ role: Role.PLAYER }, { role: Role.ADMIN }] },
      consents: {
        create: [
          { type: ConsentType.TERMS, version: POLICY_VERSION, granted: true },
          { type: ConsentType.PRIVACY_POLICY, version: POLICY_VERSION, granted: true },
        ],
      },
    },
  });

  // ── 20 players ────────────────────────────────────────────────────────────
  type SeedPlayer = [
    first: string,
    prefix: string | null,
    last: string,
    gender: Gender,
    age: number,
    level: string,
  ];
  const players: SeedPlayer[] = [
    ['Daan', null, 'Jansen', Gender.MALE, 28, 'A'],
    ['Sem', 'de', 'Vries', Gender.MALE, 24, 'A'],
    ['Lucas', 'van den', 'Berg', Gender.MALE, 31, 'B'],
    ['Milan', 'van', 'Dijk', Gender.MALE, 22, 'B'],
    ['Levi', null, 'Bakker', Gender.MALE, 37, 'B'],
    ['Finn', null, 'Visser', Gender.MALE, 26, 'C'],
    ['Noah', null, 'Smit', Gender.MALE, 41, 'C'],
    ['Jesse', null, 'Meijer', Gender.MALE, 19, 'C'],
    ['Thijs', 'de', 'Boer', Gender.MALE, 15, 'D'],
    ['Ravi', null, 'Kumar', Gender.MALE, 29, 'D'],
    ['Emma', null, 'Mulder', Gender.FEMALE, 25, 'A'],
    ['Julia', 'de', 'Groot', Gender.FEMALE, 23, 'A'],
    ['Sophie', null, 'Bos', Gender.FEMALE, 30, 'B'],
    ['Tess', null, 'Vos', Gender.FEMALE, 27, 'B'],
    ['Anna', null, 'Peters', Gender.FEMALE, 36, 'B'],
    ['Lotte', null, 'Hendriks', Gender.FEMALE, 21, 'C'],
    ['Fenna', 'van', 'Leeuwen', Gender.FEMALE, 44, 'C'],
    ['Sara', null, 'Dekker', Gender.FEMALE, 18, 'C'],
    ['Mila', null, 'Brouwer', Gender.FEMALE, 14, 'D'],
    ['Priya', null, 'Sharma', Gender.FEMALE, 33, 'D'],
  ];

  for (const [i, [first, prefix, last, gender, age, level]] of players.entries()) {
    const isMinor = age < 16;
    const emailLocal = `${first}.${prefix ? prefix.replace(/\s/g, '') : ''}${last}`.toLowerCase();
    const levelId = levels[level];
    await prisma.user.create({
      data: {
        email: `${emailLocal}@tourneasy.test`,
        name: [first, prefix, last].filter(Boolean).join(' '),
        passwordHash: playerPasswordHash,
        emailVerifiedAt: now,
        locale: i % 4 === 0 ? Locale.en : Locale.nl,
        roles: { create: [{ role: Role.PLAYER }] },
        consents: {
          create: [
            { type: ConsentType.TERMS, version: POLICY_VERSION, granted: true },
            { type: ConsentType.PRIVACY_POLICY, version: POLICY_VERSION, granted: true },
            ...(isMinor
              ? [
                  {
                    type: ConsentType.PARENTAL_CONSENT,
                    version: POLICY_VERSION,
                    granted: true,
                    grantedBy: `Ouder van ${first}`,
                  },
                ]
              : []),
          ],
        },
        playerProfile: {
          create: {
            memberNumber: await nextMemberNumber(),
            federationId: i % 3 === 0 ? `NL${(4100000 + i * 137).toString()}` : null,
            firstName: first,
            lastNamePrefix: prefix,
            lastName: last,
            dateOfBirth: dobYearsAgo(age, i * 11),
            gender,
            nationality: 'NL',
            clubId: clubs[i % clubs.length]!.id,
            levelSinglesId: levelId,
            levelDoublesId: levelId,
            levelMixedId: levelId,
            isMinor,
            parentalConsentAt: isMinor ? now : null,
            publicProfile: !isMinor,
          },
        },
      },
    });
  }

  // ── Tournaments & events ──────────────────────────────────────────────────
  const utrechtOpen = await prisma.tournament.create({
    data: {
      slug: 'utrecht-open',
      name: 'Utrecht Open',
      description: t(
        'Jaarlijks open toernooi voor alle niveaus in het hart van Utrecht.',
        'Annual open tournament for all levels in the heart of Utrecht.',
      ),
      venueId: utrecht.id,
      startsOn: dateInDays(56),
      endsOn: dateInDays(57),
      registrationOpensAt: new Date(now.getTime() - 7 * 86_400_000),
      registrationClosesAt: deadlineInDays(35),
      entryDeadline: deadlineInDays(35),
      withdrawalDeadline: deadlineInDays(28),
      status: TournamentStatus.OPEN,
      isPublished: true,
      contactName: 'Toernooicommissie BC Utrecht Smash',
      contactEmail: 'toernooi@tourneasy.test',
      maxParticipants: 160,
      maxEventsPerPlayer: 3,
    },
  });

  const seniorEvents: Array<[Discipline, string, number, DrawType]> = [
    [Discipline.HE, 'A', 1250, DrawType.KNOCKOUT],
    [Discipline.HE, 'B', 1250, DrawType.KNOCKOUT],
    [Discipline.DE, 'A', 1250, DrawType.KNOCKOUT],
    [Discipline.DE, 'B', 1250, DrawType.ROUND_ROBIN],
    [Discipline.HD, 'B', 1000, DrawType.KNOCKOUT],
    [Discipline.DD, 'B', 1000, DrawType.KNOCKOUT],
    [Discipline.GD, 'C', 1000, DrawType.GROUPS_KNOCKOUT],
  ];
  await prisma.tournamentEvent.createMany({
    data: seniorEvents.map(([discipline, level, feeCents, drawType], i) => ({
      tournamentId: utrechtOpen.id,
      discipline,
      ageCategoryId: ages.SENIOR,
      levelClassId: levels[level],
      feeCents,
      maxEntries: 32,
      drawType,
      groupSize: drawType === DrawType.GROUPS_KNOCKOUT ? 4 : null,
      advancePerGroup: drawType === DrawType.GROUPS_KNOCKOUT ? 2 : null,
      sortOrder: i,
    })),
  });

  const youth = await prisma.tournament.create({
    data: {
      slug: 'amstel-jeugdtoernooi',
      name: 'Amstel Jeugdtoernooi',
      description: t(
        'Jeugdtoernooi voor spelers tot en met 18 jaar.',
        'Youth tournament for players aged 18 and under.',
      ),
      venueId: amsterdam.id,
      startsOn: dateInDays(98),
      endsOn: dateInDays(98),
      registrationOpensAt: new Date(now.getTime() - 86_400_000),
      registrationClosesAt: deadlineInDays(77),
      entryDeadline: deadlineInDays(77),
      withdrawalDeadline: deadlineInDays(70),
      status: TournamentStatus.OPEN,
      isPublished: true,
      contactName: 'Jeugdcommissie BV Amstel Shuttles',
      contactEmail: 'jeugd@tourneasy.test',
      maxEventsPerPlayer: 2,
    },
  });

  const youthEvents: Array<[Discipline, string]> = [
    [Discipline.HE, 'U15'],
    [Discipline.DE, 'U15'],
    [Discipline.HE, 'U17'],
    [Discipline.DE, 'U17'],
    [Discipline.GD, 'U17'],
  ];
  await prisma.tournamentEvent.createMany({
    data: youthEvents.map(([discipline, age], i) => ({
      tournamentId: youth.id,
      discipline,
      ageCategoryId: ages[age],
      feeCents: discipline === Discipline.GD ? 600 : 750,
      maxEntries: 16,
      drawType: DrawType.ROUND_ROBIN,
      sortOrder: i,
    })),
  });

  await prisma.announcement.create({
    data: {
      slug: 'welkom-bij-tourneasy',
      title: t('Welkom bij Tourneasy', 'Welcome to Tourneasy'),
      body: t(
        'Schrijf je in voor toernooien, betaal met iDEAL en volg de uitslagen live.',
        'Enter tournaments, pay with iDEAL and follow results live.',
      ),
      publishedAt: now,
    },
  });

  const counts = {
    users: await prisma.user.count(),
    players: await prisma.playerProfile.count(),
    venues: await prisma.venue.count(),
    tournaments: await prisma.tournament.count(),
    events: await prisma.tournamentEvent.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
