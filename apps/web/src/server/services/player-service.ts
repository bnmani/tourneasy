/**
 * Player administration ("Main members"): search, view, add players without an account,
 * edit, merge duplicates, CSV export and import. Admin only.
 */
import { prisma, type Discipline, type Gender, Prisma } from '@tourneasy/db';
import {
  adminPlayerSchema,
  DISCIPLINES,
  fieldErrors,
  isMinor,
  mergePlayersSchema,
  parseCsvObjects,
  PLAYER_CSV_COLUMNS,
  toCsv,
} from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { excelSerialToIsoDate, looksLikeXlsx, readXlsx, toXlsx } from '../lib/xlsx';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { pageCount, pageParams, parseInput } from '../lib/validation';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';

/** Columns the admin player list can be sorted by. */
export const PLAYER_SORTS = ['name', 'number', 'gender', 'club', 'age', 'created'] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];
export type SortDir = 'asc' | 'desc';

function orderFor(
  sort: PlayerSort = 'name',
  dir: SortDir = 'asc',
): Prisma.PlayerProfileOrderByWithRelationInput[] {
  const byName: Prisma.PlayerProfileOrderByWithRelationInput[] = [
    { lastName: dir },
    { firstName: dir },
  ];
  switch (sort) {
    case 'number':
      return [{ memberNumber: dir }];
    case 'gender':
      return [{ gender: dir }, { lastName: 'asc' }, { firstName: 'asc' }];
    case 'club':
      // Players without a club go last when ascending.
      return [{ club: { name: dir } }, { lastName: 'asc' }, { firstName: 'asc' }];
    case 'age':
      // Youngest first when ascending: a later date of birth means younger.
      return [{ dateOfBirth: dir === 'asc' ? 'desc' : 'asc' }, { lastName: 'asc' }];
    case 'created':
      return [{ createdAt: dir }];
    default:
      return byName;
  }
}

export type PlayerFilters = {
  sort?: PlayerSort;
  dir?: SortDir;
  q?: string;
  gender?: Gender;
  discipline?: Discipline;
  clubId?: string;
  account?: 'with' | 'without';
  page?: number;
};

function whereFor(filters: PlayerFilters): Prisma.PlayerProfileWhereInput {
  const q = filters.q?.trim();
  return {
    deletedAt: null,
    mergedIntoId: null,
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(filters.discipline ? { preferredDisciplines: { has: filters.discipline } } : {}),
    ...(filters.clubId ? { clubId: filters.clubId } : {}),
    ...(filters.account === 'with' ? { userId: { not: null } } : {}),
    ...(filters.account === 'without' ? { userId: null } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { memberNumber: { equals: q.toUpperCase() } },
            { federationId: { equals: q } },
            { phone: { contains: q.replace(/[\s\-()]/g, '') } },
            { contactEmail: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

const listSelect = {
  id: true,
  memberNumber: true,
  firstName: true,
  lastNamePrefix: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  isMinor: true,
  phone: true,
  contactEmail: true,
  preferredDisciplines: true,
  federationId: true,
  createdAt: true,
  club: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, emailVerifiedAt: true } },
} satisfies Prisma.PlayerProfileSelect;

type PlayerRow = Prisma.PlayerProfileGetPayload<{ select: typeof listSelect }>;

export function playerEmail(p: Pick<PlayerRow, 'user' | 'contactEmail'>): string | null {
  return p.user?.email ?? p.contactEmail ?? null;
}

export function playerName(p: {
  firstName: string;
  lastNamePrefix: string | null;
  lastName: string;
}): string {
  return [p.firstName, p.lastNamePrefix, p.lastName].filter(Boolean).join(' ');
}

export async function listPlayers(actor: Actor, filters: PlayerFilters = {}) {
  assertAdmin(actor);
  const { page, skip, take } = pageParams(filters.page);
  const where = whereFor(filters);
  const [total, players] = await Promise.all([
    prisma.playerProfile.count({ where }),
    prisma.playerProfile.findMany({
      where,
      orderBy: orderFor(filters.sort, filters.dir),
      skip,
      take,
      select: listSelect,
    }),
  ]);
  // Categories in which the player has played at least one match (D57).
  const played = players.length
    ? await prisma.$queryRaw<{ playerId: string; n: bigint }[]>`
        SELECT rp."playerId", COUNT(DISTINCT rp."eventId") AS n
        FROM "RegistrationParticipant" rp
        JOIN "DrawEntry" de ON de."registrationId" = rp."registrationId"
        JOIN "Match" m ON m."entryAId" = de.id OR m."entryBId" = de.id
        WHERE rp."playerId" = ANY(${players.map((p) => p.id)}::uuid[])
          AND m.status IN ('COMPLETED', 'WALKOVER', 'RETIRED')
        GROUP BY rp."playerId"`
    : [];
  const playedOf = new Map(played.map((r) => [r.playerId, Number(r.n)]));
  return {
    players: players.map((p) => ({ ...p, categoriesPlayed: playedOf.get(p.id) ?? 0 })),
    total,
    page,
    pages: pageCount(total),
  };
}

export async function getPlayer(actor: Actor, id: string) {
  assertAdmin(actor);
  const player = await prisma.playerProfile.findUnique({
    where: { id },
    include: {
      club: { select: { id: true, name: true } },
      levelSingles: { select: { id: true, code: true } },
      levelDoubles: { select: { id: true, code: true } },
      levelMixed: { select: { id: true, code: true } },
      user: {
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          createdAt: true,
          lastLoginAt: true,
          roles: { select: { role: true } },
        },
      },
      mergedInto: { select: { id: true, memberNumber: true } },
    },
  });
  if (!player) throw new AppError('notFound');
  return player;
}

async function nextMemberNumber(tx: Prisma.TransactionClient): Promise<string> {
  const [row] = await tx.$queryRaw<
    { value: bigint }[]
  >`SELECT nextval('member_number_seq') AS value`;
  return `TE${row!.value.toString()}`;
}

function profileData(input: ReturnType<typeof adminPlayerSchema.parse>) {
  return {
    firstName: input.firstName,
    lastNamePrefix: input.lastNamePrefix ?? null,
    lastName: input.lastName,
    phone: input.phone ?? null,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender as Gender,
    nationality: input.nationality ?? null,
    clubId: input.clubId ?? null,
    federationId: input.federationId ?? null,
    levelSinglesId: input.levelSinglesId ?? null,
    levelDoublesId: input.levelDoublesId ?? null,
    levelMixedId: input.levelMixedId ?? null,
    preferredDisciplines: input.preferredDisciplines as Discipline[],
    isMinor: isMinor(input.dateOfBirth),
  };
}

function uniqueViolation(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError('validation', { fields: { federationId: 'duplicate' } });
  }
  throw error;
}

async function assertEmailFree(email: string | undefined, exceptProfileId?: string) {
  if (!email) return;
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.playerProfile.findFirst({
      where: {
        contactEmail: email,
        deletedAt: null,
        ...(exceptProfileId ? { id: { not: exceptProfileId } } : {}),
      },
    }),
  ]);
  if (user || profile) {
    throw new AppError('validation', { fields: { contactEmail: 'emailTaken' } });
  }
}

/** Adds a player without an account (e.g. a partner or someone registered at the desk). */
export async function createPlayer(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const data = parseInput(adminPlayerSchema, input);
  await assertEmailFree(data.contactEmail);
  const player = await prisma
    .$transaction(async (tx) => {
      const created = await tx.playerProfile.create({
        data: {
          ...profileData(data),
          memberNumber: await nextMemberNumber(tx),
          contactEmail: data.contactEmail ?? null,
          publicProfile: false,
          parentalConsentAt: null,
        },
      });
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'player.create',
        entityType: 'PlayerProfile',
        entityId: created.id,
        meta,
      });
      return created;
    })
    .catch(uniqueViolation);
  return player;
}

export async function updatePlayer(actor: Actor, id: string, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const data = parseInput(adminPlayerSchema, input);
  const existing = await prisma.playerProfile.findUnique({ where: { id } });
  if (!existing) throw new AppError('notFound');
  // Players with an account use their login email; contactEmail is for account-less players.
  if (!existing.userId && data.contactEmail !== existing.contactEmail)
    await assertEmailFree(data.contactEmail, id);
  const player = await prisma.playerProfile
    .update({
      where: { id },
      data: {
        ...profileData(data),
        ...(existing.userId ? {} : { contactEmail: data.contactEmail ?? null }),
      },
    })
    .catch(uniqueViolation);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'player.update',
    entityType: 'PlayerProfile',
    entityId: id,
    meta,
  });
  return player;
}

/**
 * Merges a duplicate (source) into the player that stays (target). Entries, team
 * memberships, partner requests and followers move; the source is archived. At most one
 * of the two may have an account (that account ends up on the target).
 */
export async function mergePlayers(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const { sourceId, targetMemberNumber } = parseInput(mergePlayersSchema, input);
  const [source, target] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { id: sourceId } }),
    prisma.playerProfile.findUnique({ where: { memberNumber: targetMemberNumber } }),
  ]);
  if (!source || source.deletedAt || !target || target.deletedAt) throw new AppError('notFound');
  if (source.id === target.id) throw new AppError('mergeSelf');
  if (source.userId && target.userId) throw new AppError('mergeTwoAccounts');

  await prisma.$transaction(async (tx) => {
    // Rows that would collide with the target's existing rows are left behind (archived with the source).
    const targetRegs = new Set(
      (
        await tx.registrationParticipant.findMany({
          where: { playerId: target.id },
          select: { registrationId: true },
        })
      ).map((r) => r.registrationId),
    );
    await tx.registrationParticipant.updateMany({
      where: { playerId: source.id, registrationId: { notIn: [...targetRegs] } },
      data: { playerId: target.id },
    });
    const targetTeams = new Set(
      (
        await tx.teamMember.findMany({ where: { playerId: target.id }, select: { teamId: true } })
      ).map((t) => t.teamId),
    );
    await tx.teamMember.updateMany({
      where: { playerId: source.id, teamId: { notIn: [...targetTeams] } },
      data: { playerId: target.id },
    });
    const targetFollowers = new Set(
      (
        await tx.playerFollow.findMany({
          where: { followedPlayerId: target.id },
          select: { followerUserId: true },
        })
      ).map((f) => f.followerUserId),
    );
    await tx.playerFollow.updateMany({
      where: { followedPlayerId: source.id, followerUserId: { notIn: [...targetFollowers] } },
      data: { followedPlayerId: target.id },
    });
    const targetRequests = new Set(
      (
        await tx.partnerRequest.findMany({
          where: { playerId: target.id },
          select: { eventId: true },
        })
      ).map((r) => r.eventId),
    );
    await tx.partnerRequest.updateMany({
      where: { playerId: source.id, eventId: { notIn: [...targetRequests] } },
      data: { playerId: target.id },
    });

    const sourceUserId = source.userId;
    await tx.playerProfile.update({
      where: { id: source.id },
      data: {
        mergedIntoId: target.id,
        deletedAt: new Date(),
        userId: null,
        // Free the unique values so the target can take them.
        federationId: null,
        contactEmail: null,
      },
    });
    await tx.playerProfile.update({
      where: { id: target.id },
      data: {
        ...(sourceUserId && !target.userId ? { userId: sourceUserId } : {}),
        federationId: target.federationId ?? source.federationId,
        phone: target.phone ?? source.phone,
        contactEmail:
          target.userId || sourceUserId
            ? target.contactEmail
            : (target.contactEmail ?? source.contactEmail),
        clubId: target.clubId ?? source.clubId,
      },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'player.merge',
      entityType: 'PlayerProfile',
      entityId: target.id,
      before: { source: source.memberNumber },
      after: { target: target.memberNumber },
      meta,
    });
  });
  return { targetId: target.id, targetMemberNumber: target.memberNumber };
}

// ── Export / import (Excel and CSV) ────────────────────────────────────────────────

async function exportPlayerTable(
  actor: Actor,
  filters: PlayerFilters,
): Promise<{ header: string[]; rows: (string | number)[][] }> {
  assertAdmin(actor);
  const players = await prisma.playerProfile.findMany({
    where: whereFor({ ...filters, page: undefined }),
    orderBy: orderFor(filters.sort, filters.dir),
    select: listSelect,
    take: 20_000,
  });
  const header = ['memberNumber', ...PLAYER_CSV_COLUMNS, 'hasAccount', 'createdAt'];
  const rows = players.map((p) => [
    p.memberNumber,
    p.firstName,
    p.lastNamePrefix ?? '',
    p.lastName,
    playerEmail(p) ?? '',
    p.phone ?? '',
    p.dateOfBirth.toISOString().slice(0, 10),
    p.gender,
    p.club?.name ?? '',
    p.federationId ?? '',
    p.preferredDisciplines.join(' '),
    p.user ? 'yes' : 'no',
    p.createdAt.toISOString().slice(0, 10),
  ]);
  return { header, rows };
}

export async function exportPlayersCsv(actor: Actor, filters: PlayerFilters = {}): Promise<string> {
  const { header, rows } = await exportPlayerTable(actor, filters);
  return toCsv(header, rows);
}

export async function exportPlayersXlsx(
  actor: Actor,
  filters: PlayerFilters = {},
): Promise<Uint8Array> {
  const { header, rows } = await exportPlayerTable(actor, filters);
  return toXlsx('Spelers', header, rows);
}

const TEMPLATE_ROWS = [
  [
    'Daan',
    '',
    'Jansen',
    'daan@example.nl',
    '0612345678',
    '1995-04-12',
    'MALE',
    'BC Utrecht Smash',
    '',
    'HE HD',
  ],
];

export function playerCsvTemplate(): string {
  return toCsv([...PLAYER_CSV_COLUMNS], TEMPLATE_ROWS);
}

export function playerXlsxTemplate(): Uint8Array {
  return toXlsx('Spelers', [...PLAYER_CSV_COLUMNS], TEMPLATE_ROWS);
}

export type ImportRowLog = {
  line: number;
  name: string;
  outcome: 'created' | 'updated' | 'skipped';
  memberNumber?: string;
  /** Why an existing player was matched, or that an email is shared with someone else. */
  note?: 'matchedFederationId' | 'matchedEmailAndName' | 'sharedEmail';
  sharedWith?: string;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; field: string; error: string }[];
  /** What happened to every row (D60). */
  rows: ImportRowLog[];
};

/** "José  de Vries" → "jose de vries": names compared without case, accents or extra spaces. */
const nameKey = (...parts: (string | null | undefined)[]) =>
  parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const MAX_IMPORT_ROWS = 2000;

/** Imports/updates players from CSV text. */
export async function importPlayersCsv(
  actor: Actor,
  text: string,
  meta: RequestMeta,
): Promise<ImportResult> {
  assertAdmin(actor);
  if (text.length > 2_000_000) throw new AppError('csvInvalid');
  return importPlayerRows(actor, parseCsvObjects(text), meta);
}

/** Imports an uploaded Excel (.xlsx) or CSV file; the format is detected from the content. */
export async function importPlayersFile(
  actor: Actor,
  bytes: Uint8Array,
  meta: RequestMeta,
): Promise<ImportResult> {
  assertAdmin(actor);
  if (!looksLikeXlsx(bytes)) return importPlayersCsv(actor, new TextDecoder().decode(bytes), meta);
  const grid = readXlsx(bytes);
  if (!grid) throw new AppError('csvInvalid');
  const [header = [], ...body] = grid;
  const keys = header.map((h) => h.trim().toLowerCase());
  const rows = body
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const row = Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()]));
      // Excel turns typed dates into day numbers; phone numbers may lose their leading zero.
      if (row.dateofbirth) row.dateofbirth = excelSerialToIsoDate(row.dateofbirth);
      if (row.phone && /^6\d{8}$/.test(row.phone)) row.phone = `0${row.phone}`;
      return row;
    });
  return importPlayerRows(actor, rows, meta);
}

/** Matches existing players by federation ID or email; empty cells keep existing values. */
async function importPlayerRows(
  actor: Actor,
  rows: Record<string, string>[],
  meta: RequestMeta,
): Promise<ImportResult> {
  if (rows.length === 0 || !('firstname' in rows[0]!) || !('lastname' in rows[0]!))
    throw new AppError('csvInvalid');
  if (rows.length > MAX_IMPORT_ROWS) throw new AppError('csvInvalid', { max: MAX_IMPORT_ROWS });

  const clubs = await prisma.club.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, shortName: true },
  });
  const clubByName = new Map<string, string>();
  for (const c of clubs) {
    clubByName.set(c.name.toLowerCase(), c.id);
    if (c.shortName) clubByName.set(c.shortName.toLowerCase(), c.id);
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [], rows: [] };
  for (const [index, row] of rows.entries()) {
    const line = index + 2; // header is line 1
    const preferred = (row.preferredevents ?? '')
      .toUpperCase()
      .split(/[\s,;/]+/)
      .filter((d): d is (typeof DISCIPLINES)[number] =>
        (DISCIPLINES as readonly string[]).includes(d),
      );
    const clubName = row.club?.toLowerCase();
    const parsed = adminPlayerSchema.safeParse({
      firstName: row.firstname,
      lastNamePrefix: row.lastnameprefix,
      lastName: row.lastname,
      contactEmail: row.email,
      phone: row.phone,
      dateOfBirth: row.dateofbirth,
      gender: row.gender?.toUpperCase(),
      federationId: row.federationid,
      clubId: clubName ? clubByName.get(clubName) : undefined,
      preferredDisciplines: preferred,
    });
    if (!parsed.success) {
      for (const [field, error] of Object.entries(fieldErrors(parsed.error)))
        result.errors.push({ line, field, error });
      result.skipped += 1;
      result.rows.push({
        line,
        name: [row.firstname, row.lastnameprefix, row.lastname].filter(Boolean).join(' ') || '—',
        outcome: 'skipped',
      });
      continue;
    }
    const data = parsed.data;
    const rowName = [data.firstName, data.lastNamePrefix, data.lastName].filter(Boolean).join(' ');
    // Same player = same federation ID, or same email AND same name (D60). Families and
    // couples often share one email address: a different name is a different player.
    const byFederation = data.federationId
      ? await prisma.playerProfile.findFirst({
          where: { deletedAt: null, federationId: data.federationId },
        })
      : null;
    const sameEmail = data.contactEmail
      ? await prisma.playerProfile.findMany({
          where: {
            deletedAt: null,
            OR: [{ contactEmail: data.contactEmail }, { user: { email: data.contactEmail } }],
          },
        })
      : [];
    const wanted = nameKey(data.firstName, data.lastNamePrefix, data.lastName);
    const byEmailAndName = sameEmail.find(
      (p) => nameKey(p.firstName, p.lastNamePrefix, p.lastName) === wanted,
    );
    const existing = byFederation ?? byEmailAndName ?? null;
    const sharedWith = !existing ? sameEmail[0] : undefined;
    try {
      if (existing) {
        // Empty cells leave existing values alone (an export→edit→import round trip is safe).
        const provided = Object.fromEntries(
          Object.entries(profileData(data)).filter(
            ([, v]) => v !== null && !(Array.isArray(v) && v.length === 0),
          ),
        );
        await prisma.playerProfile.update({
          where: { id: existing.id },
          data: {
            ...provided,
            ...(existing.userId
              ? {}
              : { contactEmail: data.contactEmail ?? existing.contactEmail }),
          },
        });
        result.updated += 1;
        result.rows.push({
          line,
          name: rowName,
          outcome: 'updated',
          memberNumber: existing.memberNumber,
          note: byFederation ? 'matchedFederationId' : 'matchedEmailAndName',
        });
      } else {
        const created = await prisma.$transaction(async (tx) =>
          tx.playerProfile.create({
            data: {
              ...profileData(data),
              memberNumber: await nextMemberNumber(tx),
              contactEmail: data.contactEmail ?? null,
              publicProfile: false,
            },
          }),
        );
        result.created += 1;
        result.rows.push({
          line,
          name: rowName,
          outcome: 'created',
          memberNumber: created.memberNumber,
          ...(sharedWith
            ? {
                note: 'sharedEmail' as const,
                sharedWith: `${sharedWith.memberNumber} ${[sharedWith.firstName, sharedWith.lastName].join(' ')}`,
              }
            : {}),
        });
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        result.errors.push({ line, field: 'federationId', error: 'duplicate' });
        result.skipped += 1;
        result.rows.push({ line, name: rowName, outcome: 'skipped' });
      } else {
        throw error;
      }
    }
  }
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'player.import',
    entityType: 'PlayerProfile',
    after: { created: result.created, updated: result.updated, skipped: result.skipped },
    meta,
  });
  return result;
}
