/**
 * Public (no login) reads for the website and /api/v1: published tournaments, venues, clubs
 * and players who chose a public profile. Responses use the shapes in
 * packages/shared/src/schemas/public.ts; nothing here returns contact details of players.
 */
import { Prisma, prisma, type Discipline, type Province } from '@tourneasy/db';
import {
  amsterdamToday,
  MINOR_AGE,
  publicDirectoryQuerySchema,
  publicTournamentQuerySchema,
  tournamentPhase,
  type PublicClub,
  type PublicDirectoryQuery,
  type PublicEvent,
  type PublicPlayer,
  type PublicTournament,
  type PublicTournamentQuery,
  type PublicTournamentSummary,
  type PublicVenue,
} from '@tourneasy/shared';
import { AppError } from '../lib/errors';
import { parseInput } from '../lib/validation';
import type { Actor } from './session-service';
import { logoUrlFor } from './logo-service';

// ── Paging ─────────────────────────────────────────────────────────────────────────

export type Paged<T> = { data: T[]; total: number; nextCursor: string | null };

/** Opaque cursor for the API (an offset today; clients must not rely on its format). */
export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const m = /^o:(\d{1,7})$/.exec(Buffer.from(cursor, 'base64url').toString());
  if (!m) throw new AppError('validation', { fields: { cursor: 'invalid' } });
  return Number(m[1]);
}

type Window = { offset?: number; limit: number };
function paged<T>(data: T[], total: number, { offset = 0, limit }: Window): Paged<T> {
  return { data, total, nextCursor: offset + limit < total ? encodeCursor(offset + limit) : null };
}

/** Tournament days are stored as UTC-midnight dates. */
function todayDate(now = new Date()): Date {
  return new Date(`${amsterdamToday(now)}T00:00:00Z`);
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const localizedOrNull = (v: Prisma.JsonValue | null) =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as { nl?: string; en?: string }) : null;
const searchTerms = (q?: string) => (q ? q.split(/\s+/).filter(Boolean).slice(0, 4) : []);

// ── Tournaments ────────────────────────────────────────────────────────────────────

const PUBLISHED: Prisma.TournamentWhereInput = { isPublished: true, deletedAt: null };
const LIVE_EVENTS = { where: { deletedAt: null } } as const;

const summarySelect = {
  id: true,
  logo: { select: { updatedAt: true } },
  slug: true,
  name: true,
  status: true,
  startsOn: true,
  endsOn: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  venue: { select: { slug: true, name: true, city: true, province: true, deletedAt: true } },
  events: { ...LIVE_EVENTS, select: { discipline: true, feeCents: true } },
} satisfies Prisma.TournamentSelect;

type SummaryRow = Prisma.TournamentGetPayload<{ select: typeof summarySelect }>;

function toSummary(t: SummaryRow, now: Date): PublicTournamentSummary {
  const fees = t.events.map((e) => e.feeCents);
  const disciplines = [...new Set(t.events.map((e) => e.discipline))];
  return {
    slug: t.slug,
    name: t.name,
    startsOn: isoDay(t.startsOn),
    endsOn: isoDay(t.endsOn),
    phase: tournamentPhase(t, now),
    registrationOpensAt: t.registrationOpensAt.toISOString(),
    registrationClosesAt: t.registrationClosesAt.toISOString(),
    venue:
      t.venue && !t.venue.deletedAt
        ? { slug: t.venue.slug, name: t.venue.name, city: t.venue.city, province: t.venue.province }
        : null,
    disciplines: (['HE', 'DE', 'HD', 'DD', 'GD'] as const).filter((d) => disciplines.includes(d)),
    eventCount: t.events.length,
    feeFromCents: fees.length ? Math.min(...fees) : null,
    feeToCents: fees.length ? Math.max(...fees) : null,
    logoUrl: t.logo ? logoUrlFor(t.id, t.logo.updatedAt) : null,
  };
}

function tournamentWhere(query: PublicTournamentQuery, now: Date): Prisma.TournamentWhereInput {
  const today = todayDate(now);
  const when: Prisma.TournamentWhereInput =
    query.when === 'past'
      ? { endsOn: { lt: today } }
      : query.when === 'open'
        ? {
            endsOn: { gte: today },
            status: 'OPEN',
            registrationOpensAt: { lte: now },
            registrationClosesAt: { gt: now },
          }
        : { endsOn: { gte: today } };
  return {
    ...PUBLISHED,
    ...when,
    ...(query.province ? { venue: { province: query.province as Province } } : {}),
    ...(query.discipline
      ? { events: { some: { deletedAt: null, discipline: query.discipline as Discipline } } }
      : {}),
    AND: searchTerms(query.q).map((term) => ({
      OR: [
        { name: { contains: term, mode: 'insensitive' as const } },
        { venue: { city: { contains: term, mode: 'insensitive' as const } } },
        { venue: { name: { contains: term, mode: 'insensitive' as const } } },
      ],
    })),
  };
}

export async function listPublicTournaments(
  input: unknown,
  window?: { offset: number },
  now = new Date(),
): Promise<Paged<PublicTournamentSummary>> {
  const query = parseInput(publicTournamentQuerySchema, input);
  const offset = window?.offset ?? decodeCursor(query.cursor);
  const where = tournamentWhere(query, now);
  const orderBy: Prisma.TournamentOrderByWithRelationInput[] =
    query.when === 'past'
      ? [{ startsOn: 'desc' }, { name: 'asc' }]
      : query.when === 'open'
        ? [{ registrationClosesAt: 'asc' }, { name: 'asc' }]
        : [{ startsOn: 'asc' }, { name: 'asc' }];
  const [rows, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      orderBy,
      skip: offset,
      take: query.limit,
      select: summarySelect,
    }),
    prisma.tournament.count({ where }),
  ]);
  return paged(
    rows.map((r) => toSummary(r, now)),
    total,
    { offset, limit: query.limit },
  );
}

/** Current and upcoming tournaments for the home page carousel. */
export async function featuredTournaments(limit = 6, now = new Date()) {
  const rows = await prisma.tournament.findMany({
    where: { ...PUBLISHED, endsOn: { gte: todayDate(now) } },
    orderBy: [{ startsOn: 'asc' }, { name: 'asc' }],
    take: limit,
    select: summarySelect,
  });
  return rows.map((r) => toSummary(r, now));
}

/** Tournaments from the start of this month for `months` months, for the calendar page. */
export async function calendarTournaments(months = 12, now = new Date()) {
  const today = todayDate(now);
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + months, 1));
  const rows = await prisma.tournament.findMany({
    where: { ...PUBLISHED, startsOn: { lt: to }, endsOn: { gte: from } },
    orderBy: [{ startsOn: 'asc' }, { name: 'asc' }],
    take: 500,
    select: summarySelect,
  });
  return rows.map((r) => toSummary(r, now));
}

const venueSelect = {
  slug: true,
  name: true,
  street: true,
  houseNumber: true,
  postcode: true,
  city: true,
  province: true,
  country: true,
  latitude: true,
  longitude: true,
  numberOfCourts: true,
  phone: true,
  website: true,
  facilities: true,
  parkingInfo: true,
  publicTransportInfo: true,
} satisfies Prisma.VenueSelect;

function toVenue(v: Prisma.VenueGetPayload<{ select: typeof venueSelect }>): PublicVenue {
  return {
    ...v,
    latitude: v.latitude === null ? null : Number(v.latitude),
    longitude: v.longitude === null ? null : Number(v.longitude),
    facilities: localizedOrNull(v.facilities),
    parkingInfo: localizedOrNull(v.parkingInfo),
    publicTransportInfo: localizedOrNull(v.publicTransportInfo),
  };
}

export async function getPublicTournament(
  slug: string,
  now = new Date(),
): Promise<PublicTournament> {
  const t = await prisma.tournament.findFirst({
    where: { ...PUBLISHED, slug },
    select: {
      ...summarySelect,
      description: true,
      dayStartTime: true,
      withdrawalDeadline: true,
      maxEventsPerPlayer: true,
      bundlePricesCents: true,
      schedulePublishedAt: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      venue: { select: { ...venueSelect, deletedAt: true } },
      events: {
        ...LIVE_EVENTS,
        orderBy: [{ sortOrder: 'asc' }, { discipline: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          discipline: true,
          name: true,
          feeCents: true,
          maxEntries: true,
          drawType: true,
          groupSize: true,
          advancePerGroup: true,
          matchesPerEntry: true,
          knockoutSize: true,
          bestOf: true,
          pointsToWin: true,
          pointsCap: true,
          koScoringFrom: true,
          koBestOf: true,
          koPointsToWin: true,
          koPointsCap: true,
          isOpen: true,
          ageCategory: { select: { code: true, name: true, sortOrder: true } },
          levelClass: { select: { code: true, rank: true } },
        },
      },
    },
  });
  if (!t) throw new AppError('notFound');
  const events: PublicEvent[] = t.events
    .sort(
      (a, b) =>
        (a.ageCategory?.sortOrder ?? -1) - (b.ageCategory?.sortOrder ?? -1) ||
        (a.levelClass?.rank ?? 0) - (b.levelClass?.rank ?? 0),
    )
    .map((e) => ({
      id: e.id,
      discipline: e.discipline,
      name: localizedOrNull(e.name),
      ageCategory: e.ageCategory
        ? { code: e.ageCategory.code, name: localizedOrNull(e.ageCategory.name) }
        : null,
      level: e.levelClass?.code ?? null,
      feeCents: e.feeCents,
      maxEntries: e.maxEntries,
      drawType: e.drawType,
      groupSize: e.groupSize,
      advancePerGroup: e.advancePerGroup,
      matchesPerEntry: e.matchesPerEntry,
      knockoutSize: e.knockoutSize,
      bestOf: e.bestOf,
      pointsToWin: e.pointsToWin,
      pointsCap: e.pointsCap,
      knockoutScoring: e.koScoringFrom
        ? {
            from: e.koScoringFrom as 'KO' | 'QF' | 'SF' | 'F',
            bestOf: e.koBestOf ?? e.bestOf,
            pointsToWin: e.koPointsToWin ?? e.pointsToWin,
            pointsCap: e.koPointsCap ?? e.pointsCap,
          }
        : null,
      isOpen: e.isOpen,
    }));
  const venue = t.venue && !t.venue.deletedAt ? toVenue(t.venue) : null;
  return {
    ...toSummary({ ...t, venue: t.venue }, now),
    venue,
    description: localizedOrNull(t.description),
    dayStartTime: t.dayStartTime,
    withdrawalDeadline: t.withdrawalDeadline.toISOString(),
    maxEventsPerPlayer: t.maxEventsPerPlayer,
    bundlePricesCents: t.bundlePricesCents,
    schedulePublished: !!t.schedulePublishedAt,
    contact: { name: t.contactName, email: t.contactEmail, phone: t.contactPhone },
    events,
  };
}

// ── Venues ─────────────────────────────────────────────────────────────────────────

function directoryWhere(query: PublicDirectoryQuery, fields: string[]) {
  return {
    deletedAt: null,
    ...(query.province ? { province: query.province as Province } : {}),
    AND: searchTerms(query.q).map((term) => ({
      OR: fields.map((f) => ({ [f]: { contains: term, mode: 'insensitive' as const } })),
    })),
  };
}

export async function listPublicVenues(input: unknown, window?: { offset: number }) {
  const query = parseInput(publicDirectoryQuerySchema, input);
  const offset = window?.offset ?? decodeCursor(query.cursor);
  const where: Prisma.VenueWhereInput = directoryWhere(query, ['name', 'city']);
  const [rows, total] = await Promise.all([
    prisma.venue.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: offset,
      take: query.limit,
      select: venueSelect,
    }),
    prisma.venue.count({ where }),
  ]);
  return paged(rows.map(toVenue), total, { offset, limit: query.limit });
}

export async function getPublicVenue(slug: string, now = new Date()) {
  const v = await prisma.venue.findFirst({ where: { slug, deletedAt: null }, select: venueSelect });
  if (!v) throw new AppError('notFound');
  const [tournaments, clubs] = await Promise.all([
    prisma.tournament.findMany({
      where: { ...PUBLISHED, venue: { slug }, endsOn: { gte: todayDate(now) } },
      orderBy: [{ startsOn: 'asc' }],
      take: 20,
      select: summarySelect,
    }),
    prisma.club.findMany({
      where: { deletedAt: null, venue: { slug } },
      orderBy: { name: 'asc' },
      select: { slug: true, name: true },
    }),
  ]);
  return {
    venue: toVenue(v),
    tournaments: tournaments.map((t) => toSummary(t, now)),
    clubs,
  };
}

// ── Players (public profiles only) ─────────────────────────────────────────────────

/** Opted in, has an account, not a minor (D30), not merged or deleted. */
export function publicPlayerWhere(now = new Date()): Prisma.PlayerProfileWhereInput {
  const today = todayDate(now);
  const adultCutoff = new Date(
    Date.UTC(today.getUTCFullYear() - MINOR_AGE, today.getUTCMonth(), today.getUTCDate()),
  );
  return {
    publicProfile: true,
    isMinor: false,
    dateOfBirth: { lte: adultCutoff },
    deletedAt: null,
    mergedIntoId: null,
    user: { is: { deletedAt: null, anonymisedAt: null } },
  };
}

const playerSelect = {
  id: true,
  userId: true,
  memberNumber: true,
  firstName: true,
  lastNamePrefix: true,
  lastName: true,
  preferredDisciplines: true,
  club: { select: { slug: true, name: true, deletedAt: true } },
  _count: { select: { followers: true } },
} satisfies Prisma.PlayerProfileSelect;

function toPlayer(
  p: Prisma.PlayerProfileGetPayload<{ select: typeof playerSelect }>,
): PublicPlayer {
  return {
    memberNumber: p.memberNumber,
    name: [p.firstName, p.lastNamePrefix, p.lastName].filter(Boolean).join(' '),
    club: p.club && !p.club.deletedAt ? { slug: p.club.slug, name: p.club.name } : null,
    preferredDisciplines: p.preferredDisciplines,
    followerCount: p._count.followers,
  };
}

export async function listPublicPlayers(input: unknown, window?: { offset: number }) {
  const query = parseInput(publicDirectoryQuerySchema, input);
  const offset = window?.offset ?? decodeCursor(query.cursor);
  const where: Prisma.PlayerProfileWhereInput = {
    ...publicPlayerWhere(),
    AND: searchTerms(query.q).map((term) => ({
      OR: [
        { firstName: { contains: term, mode: 'insensitive' as const } },
        { lastName: { contains: term, mode: 'insensitive' as const } },
        { lastNamePrefix: { contains: term, mode: 'insensitive' as const } },
        { memberNumber: { equals: term.toUpperCase() } },
        { club: { name: { contains: term, mode: 'insensitive' as const } } },
      ],
    })),
  };
  const [rows, total] = await Promise.all([
    prisma.playerProfile.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip: offset,
      take: query.limit,
      select: playerSelect,
    }),
    prisma.playerProfile.count({ where }),
  ]);
  return paged(rows.map(toPlayer), total, { offset, limit: query.limit });
}

export async function getPublicPlayer(memberNumber: string, viewer?: Actor | null) {
  const p = await prisma.playerProfile.findFirst({
    where: { ...publicPlayerWhere(), memberNumber: memberNumber.toUpperCase() },
    select: playerSelect,
  });
  if (!p) throw new AppError('notFound');
  const following = viewer
    ? !!(await prisma.playerFollow.findUnique({
        where: {
          followerUserId_followedPlayerId: {
            followerUserId: viewer.userId,
            followedPlayerId: p.id,
          },
        },
      }))
    : false;
  return { player: toPlayer(p), isSelf: !!viewer && viewer.userId === p.userId, following };
}

/** Follow a public player; notifications about their matches follow in Phase 7. */
export async function followPlayer(actor: Actor, memberNumber: string) {
  const p = await prisma.playerProfile.findFirst({
    where: { ...publicPlayerWhere(), memberNumber: memberNumber.toUpperCase() },
    select: { id: true, userId: true },
  });
  if (!p) throw new AppError('notFound');
  if (p.userId === actor.userId) throw new AppError('forbidden');
  await prisma.playerFollow.upsert({
    where: {
      followerUserId_followedPlayerId: { followerUserId: actor.userId, followedPlayerId: p.id },
    },
    create: { followerUserId: actor.userId, followedPlayerId: p.id },
    update: {},
  });
}

export async function unfollowPlayer(actor: Actor, memberNumber: string) {
  await prisma.playerFollow.deleteMany({
    where: { followerUserId: actor.userId, followed: { memberNumber: memberNumber.toUpperCase() } },
  });
}

/** Players I follow (still public), for my dashboard. */
export async function listFollowing(actor: Actor) {
  const rows = await prisma.playerFollow.findMany({
    where: { followerUserId: actor.userId, followed: publicPlayerWhere() },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { followed: { select: playerSelect } },
  });
  return rows.map((r) => toPlayer(r.followed));
}

// ── Clubs ──────────────────────────────────────────────────────────────────────────

const clubSelect = (now: Date) =>
  ({
    slug: true,
    name: true,
    shortName: true,
    city: true,
    province: true,
    website: true,
    venue: { select: { slug: true, name: true, city: true, province: true, deletedAt: true } },
    _count: { select: { players: { where: publicPlayerWhere(now) } } },
  }) satisfies Prisma.ClubSelect;

function toClub(c: Prisma.ClubGetPayload<{ select: ReturnType<typeof clubSelect> }>): PublicClub {
  return {
    slug: c.slug,
    name: c.name,
    shortName: c.shortName,
    city: c.city,
    province: c.province,
    website: c.website,
    venue:
      c.venue && !c.venue.deletedAt
        ? { slug: c.venue.slug, name: c.venue.name, city: c.venue.city, province: c.venue.province }
        : null,
    publicPlayerCount: c._count.players,
  };
}

export async function listPublicClubs(
  input: unknown,
  window?: { offset: number },
  now = new Date(),
) {
  const query = parseInput(publicDirectoryQuerySchema, input);
  const offset = window?.offset ?? decodeCursor(query.cursor);
  const where: Prisma.ClubWhereInput = directoryWhere(query, ['name', 'shortName', 'city']);
  const [rows, total] = await Promise.all([
    prisma.club.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: offset,
      take: query.limit,
      select: clubSelect(now),
    }),
    prisma.club.count({ where }),
  ]);
  return paged(rows.map(toClub), total, { offset, limit: query.limit });
}

export async function getPublicClub(slug: string, now = new Date()) {
  const c = await prisma.club.findFirst({
    where: { slug, deletedAt: null },
    select: clubSelect(now),
  });
  if (!c) throw new AppError('notFound');
  const players = await prisma.playerProfile.findMany({
    where: { ...publicPlayerWhere(now), club: { slug } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 200,
    select: playerSelect,
  });
  return { club: toClub(c), players: players.map(toPlayer) };
}

// ── Sitemap ────────────────────────────────────────────────────────────────────────

/** Public URLs for the sitemap (player pages are left out on purpose: they are noindex). */
export async function sitemapEntries() {
  const [tournaments, venues, clubs] = await Promise.all([
    prisma.tournament.findMany({ where: PUBLISHED, select: { slug: true, updatedAt: true } }),
    prisma.venue.findMany({ where: { deletedAt: null }, select: { slug: true, updatedAt: true } }),
    prisma.club.findMany({ where: { deletedAt: null }, select: { slug: true, updatedAt: true } }),
  ]);
  return { tournaments, venues, clubs };
}
