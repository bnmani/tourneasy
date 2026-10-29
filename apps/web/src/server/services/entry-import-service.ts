/**
 * Adding participants as an organiser (D53, D63): an Excel/CSV import with one row per entry
 * (a player, or a pair for doubles) including the players' details, and the "add entry" screen.
 * Players are found by member number, federation ID, email + name, or name + date of birth, and
 * created when they don't exist yet — no separate player import or export round trip. The usual
 * eligibility and pair rules apply; the entry window and the per-player maximum don't (the
 * organiser decides). Full events put the entry on the waiting list. No emails are sent.
 * The participants export can be imported back (partner rows follow their entrant).
 */
import { Prisma, prisma, type RegistrationStatus } from '@tourneasy/db';
import { isDoubles, pairEligibility, parseCsvObjects } from '@tourneasy/shared';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { randomToken } from '../lib/crypto';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { looksLikeXlsx, readXlsx, toXlsx } from '../lib/xlsx';
import { assertCanManageTournament } from './permissions';
import { namesakes, resolvePlayer, type PlayerSpec } from './player-resolve';
import {
  ACTIVE,
  activeCounts,
  eligibility,
  eventSelect,
  eventText,
  fullName,
  playerEntries,
  type EventRow,
  type PlayerRow,
} from './registration-service';
import type { Actor } from './session-service';

const PLAYER_COLUMNS = [
  'memberNumber',
  'firstName',
  'lastNamePrefix',
  'lastName',
  'gender',
  'dateOfBirth',
  'email',
  'club',
  'federationId',
] as const;

/** Template columns: the category, the player, and (doubles) the partner. */
export const ENTRY_IMPORT_COLUMNS = [
  'event',
  ...PLAYER_COLUMNS,
  ...PLAYER_COLUMNS.map((c) => `partner${c[0]!.toUpperCase()}${c.slice(1)}`),
] as const;

const MAX_ROWS = 2000;

export type EntryRowLog = {
  line: number;
  name: string;
  outcome: 'created' | 'waitlisted' | 'skipped';
  /** Players that were new to Tourneasy (member numbers). */
  newPlayers: string[];
  field?: string;
  error?: string;
};

export type EntryImportResult = {
  created: number;
  waitlisted: number;
  skipped: number;
  newPlayers: number;
  errors: { line: number; field: string; error: string }[];
  rows: EntryRowLog[];
};

/** Reads an uploaded Excel or CSV file into rows keyed by lower-case column name. */
function readRows(bytes: Uint8Array): Record<string, string>[] {
  if (!looksLikeXlsx(bytes)) {
    if (bytes.length > 2_000_000) throw new AppError('csvInvalid');
    return parseCsvObjects(new TextDecoder().decode(bytes));
  }
  const grid = readXlsx(bytes);
  if (!grid) throw new AppError('csvInvalid');
  const [header = [], ...body] = grid;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}

async function loadTournament(tournamentId: string) {
  const t = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
    select: {
      id: true,
      name: true,
      startsOn: true,
      maxParticipants: true,
      partnerPaymentMode: true,
      events: { where: { deletedAt: null }, select: eventSelect, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!t) throw new AppError('notFound');
  return t;
}
type TournamentRow = Awaited<ReturnType<typeof loadTournament>>;

/** Player details from a row; `prefix` is "" for the player and "partner" for the partner. */
function specFrom(row: Record<string, string>, prefix: '' | 'partner'): PlayerSpec | null {
  const get = (c: string) =>
    row[`${prefix}${prefix ? c.toLowerCase() : c.toLowerCase()}`] || undefined;
  const spec: PlayerSpec = {
    memberNumber: get('memberNumber'),
    firstName: get('firstName'),
    lastNamePrefix: get('lastNamePrefix'),
    lastName: get('lastName'),
    gender: get('gender'),
    dateOfBirth: get('dateOfBirth'),
    email: get('email'),
    club: get('club'),
    federationId: get('federationId'),
  };
  return Object.values(spec).some(Boolean) ? spec : null;
}

/** Why an entry can't be made (field + error key), or null when it can. */
async function entryProblem(
  t: TournamentRow,
  event: EventRow,
  player: PlayerRow,
  partner: PlayerRow | null,
): Promise<{ field: string; error: string } | null> {
  if (partner && !isDoubles(event.discipline)) return { field: 'partner', error: 'invalid' };
  if (partner?.id === player.id) return { field: 'partner', error: 'partnerSelf' };
  if (eligibility(player, event, t.startsOn).length > 0)
    return { field: 'player', error: 'notEligible' };
  if (
    partner &&
    [
      ...eligibility(partner, event, t.startsOn),
      ...pairEligibility(event.discipline, player, partner),
    ].length > 0
  )
    return { field: 'partner', error: 'partnerIneligible' };
  if ((await playerEntries(player.id, t.id)).has(event.id))
    return { field: 'player', error: 'alreadyEntered' };
  if (partner && (await playerEntries(partner.id, t.id)).has(event.id))
    return { field: 'partner', error: 'partnerAlreadyEntered' };
  return null;
}

/** Creates a confirmed (or, when full, waitlisted) entry for a player or pair. */
async function createEntry(
  actor: Actor,
  t: TournamentRow,
  event: EventRow,
  player: PlayerRow,
  partner: PlayerRow | null,
  meta: RequestMeta,
  action: string,
): Promise<RegistrationStatus> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TournamentEvent" WHERE id = ${event.id}::uuid FOR UPDATE`;
      const taken = (await activeCounts([event.id], tx)).get(event.id) ?? 0;
      const playersIn = t.maxParticipants
        ? await tx.registrationParticipant.count({
            where: {
              active: true,
              registration: { status: { in: ACTIVE }, event: { tournamentId: t.id } },
            },
          })
        : 0;
      const full =
        (event.maxEntries !== null && taken >= event.maxEntries) ||
        (t.maxParticipants !== null && playersIn >= t.maxParticipants);
      let waitlistPosition: number | null = null;
      if (full) {
        const last = await tx.registration.aggregate({
          where: { eventId: event.id, status: 'WAITLISTED' },
          _max: { waitlistPosition: true },
        });
        waitlistPosition = (last._max.waitlistPosition ?? 0) + 1;
      }
      const status: RegistrationStatus = full ? 'WAITLISTED' : 'CONFIRMED';
      const free = event.feeCents === 0;
      const registration = await tx.registration.create({
        data: {
          eventId: event.id,
          status,
          waitlistPosition,
          createdById: actor.userId,
          confirmedAt: full ? null : new Date(),
          participants: {
            create: [
              {
                eventId: event.id,
                playerId: player.id,
                role: 'PRIMARY',
                checkInToken: randomToken(18),
                paymentStatus: free ? 'WAIVED' : 'UNPAID',
              },
              ...(partner
                ? [
                    {
                      eventId: event.id,
                      playerId: partner.id,
                      role: 'PARTNER' as const,
                      checkInToken: randomToken(18),
                      paymentStatus: free
                        ? ('WAIVED' as const)
                        : t.partnerPaymentMode === 'INITIATOR_PAYS_ALL'
                          ? ('PAID_BY_PARTNER' as const)
                          : ('UNPAID' as const),
                    },
                  ]
                : []),
            ],
          },
        },
      });
      await writeAudit(tx, {
        actorId: actor.userId,
        action,
        entityType: 'Registration',
        entityId: registration.id,
        after: { eventId: event.id, status, waitlistPosition },
        meta,
      });
      return status;
    });
  } catch (error) {
    // The partial unique index catches a duplicate entry (same file, or a race).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw validationError({ player: 'alreadyEntered' });
    }
    throw error;
  }
}

type Planned = { line: number; event: EventRow; player: PlayerSpec; partner: PlayerSpec | null };

export async function importTournamentEntries(
  actor: Actor,
  tournamentId: string,
  bytes: Uint8Array,
  meta: RequestMeta,
): Promise<EntryImportResult> {
  await assertCanManageTournament(actor, tournamentId);
  const t = await loadTournament(tournamentId);
  const rows = readRows(bytes).filter((r) => Object.values(r).some((v) => v !== ''));
  if (rows.length === 0 || !('event' in rows[0]!)) throw new AppError('csvInvalid');
  if (!['membernumber', 'email', 'lastname'].some((c) => c in rows[0]!))
    throw new AppError('csvInvalid');
  if (rows.length > MAX_ROWS) throw new AppError('csvInvalid', { max: MAX_ROWS });

  // Events by their label in either language (as in the export), or by id.
  const eventByKey = new Map<string, EventRow>();
  for (const e of t.events) {
    eventByKey.set(e.id, e);
    eventByKey.set(eventText(e, 'nl').toLowerCase(), e);
    eventByKey.set(eventText(e, 'en').toLowerCase(), e);
  }

  const result: EntryImportResult = {
    created: 0,
    waitlisted: 0,
    skipped: 0,
    newPlayers: 0,
    errors: [],
    rows: [],
  };
  const nameOf = (s: PlayerSpec | null) =>
    s
      ? [s.firstName, s.lastNamePrefix, s.lastName].filter(Boolean).join(' ') ||
        s.memberNumber ||
        s.email ||
        ''
      : '';
  const fail = (
    line: number,
    name: string,
    field: string,
    error: string,
    newPlayers: string[] = [],
  ) => {
    result.errors.push({ line, field, error });
    result.skipped += 1;
    result.rows.push({ line, name, outcome: 'skipped', newPlayers, field, error });
  };

  // Rows → entries. In the participants export a partner has its own row (role PARTNER) right
  // after the entrant; cancelled rows are left out.
  const planned: Planned[] = [];
  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    if (row.status === 'CANCELLED') continue;
    const event = eventByKey.get((row.event ?? '').toLowerCase());
    const player = specFrom(row, '');
    if (row.role === 'PARTNER') {
      const last = planned[planned.length - 1];
      if (last && last.event.id === event?.id && !last.partner) last.partner = player;
      else fail(line, nameOf(player), 'role', 'invalid');
      continue;
    }
    if (!event) {
      fail(line, nameOf(player), 'event', 'eventNotFound');
      continue;
    }
    if (!player) {
      fail(line, '', 'memberNumber', 'required');
      continue;
    }
    planned.push({ line, event, player, partner: specFrom(row, 'partner') });
  }

  for (const plan of planned) {
    const name = [nameOf(plan.player), nameOf(plan.partner)].filter(Boolean).join(' / ');
    const newPlayers: string[] = [];
    const p1 = await resolvePlayer(plan.player, { create: true });
    if (!p1.ok) {
      fail(plan.line, name, p1.field, p1.error);
      continue;
    }
    if (p1.created) newPlayers.push(p1.player.memberNumber);
    let partner: PlayerRow | null = null;
    if (plan.partner) {
      const p2 = await resolvePlayer(plan.partner, { create: true });
      if (!p2.ok) {
        fail(
          plan.line,
          name,
          `partner${p2.field[0]!.toUpperCase()}${p2.field.slice(1)}`,
          p2.error === 'playerNotFound' ? 'partnerNotFound' : p2.error,
          newPlayers,
        );
        continue;
      }
      if (p2.created) newPlayers.push(p2.player.memberNumber);
      partner = p2.player;
    }
    result.newPlayers += newPlayers.length;
    const problem = await entryProblem(t, plan.event, p1.player, partner);
    if (problem) {
      fail(plan.line, name, problem.field, problem.error, newPlayers);
      continue;
    }
    try {
      const status = await createEntry(
        actor,
        t,
        plan.event,
        p1.player,
        partner,
        meta,
        'registration.import',
      );
      if (status === 'WAITLISTED') result.waitlisted += 1;
      else result.created += 1;
      result.rows.push({
        line: plan.line,
        name: [fullName(p1.player), partner ? fullName(partner) : null].filter(Boolean).join(' / '),
        outcome: status === 'WAITLISTED' ? 'waitlisted' : 'created',
        newPlayers,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'validation')
        fail(plan.line, name, 'player', 'alreadyEntered', newPlayers);
      else throw error;
    }
  }

  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'registration.importFile',
    entityType: 'Tournament',
    entityId: t.id,
    after: {
      created: result.created,
      waitlisted: result.waitlisted,
      skipped: result.skipped,
      newPlayers: result.newPlayers,
    },
    meta,
  });
  return result;
}

/** Example file with this tournament's categories: a known player and a new pair. */
export async function entryImportTemplate(actor: Actor, tournamentId: string) {
  const t = await loadTournament(tournamentId);
  await assertCanManageTournament(actor, tournamentId);
  const blank = (n: number) => Array.from({ length: n }, () => '');
  const rows = t.events
    .slice(0, 3)
    .map((e, i) =>
      i === 0
        ? [
            eventText(e, 'nl'),
            'TE100001',
            ...blank(8),
            ...(isDoubles(e.discipline) ? ['TE100002', ...blank(8)] : blank(9)),
          ]
        : [
            eventText(e, 'nl'),
            '',
            'Daan',
            '',
            'Jansen',
            'M',
            '1995-04-12',
            'daan@example.nl',
            '',
            '',
            ...(isDoubles(e.discipline)
              ? [
                  '',
                  e.discipline === 'GD' ? 'Eva' : 'Sem',
                  'de',
                  e.discipline === 'GD' ? 'Vries' : 'Bakker',
                  e.discipline === 'GD' ? 'V' : 'M',
                  '1996-09-30',
                  '',
                  '',
                  '',
                ]
              : blank(9)),
          ],
    );
  return toXlsx('Deelnemers', [...ENTRY_IMPORT_COLUMNS], rows);
}

// ── Add entry screen (D63) ─────────────────────────────────────────────────────────

const newPlayerSchema = z.object({
  firstName: z.string().max(60),
  lastNamePrefix: z.string().max(20).optional(),
  lastName: z.string().max(80),
  gender: z.string().max(10),
  dateOfBirth: z.string().max(10),
  email: z.string().max(254).optional(),
});
const pickSchema = z.union([
  z.object({ memberNumber: z.string().regex(/^TE\d{6}$/i) }),
  z.object({ new: newPlayerSchema }),
]);
const addEntrySchema = z.object({
  eventId: z.string().uuid(),
  player: pickSchema,
  partner: pickSchema.optional(),
  /** The organiser saw the possible duplicates and still wants new players (D82). */
  allowNew: z.boolean().default(false),
});

/** Adds one entry (player or pair) by hand; new players are created on the fly. */
export async function addEntryAsOrganiser(
  actor: Actor,
  tournamentId: string,
  input: unknown,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const data = parseInput(addEntrySchema, input);
  const t = await loadTournament(tournamentId);
  const event = t.events.find((e) => e.id === data.eventId);
  if (!event) throw validationError({ eventId: 'eventNotFound' });
  if (isDoubles(event.discipline) && !data.partner)
    throw validationError({ partner: 'partnerRequired' });
  const spec = (p: z.infer<typeof pickSchema>): PlayerSpec =>
    'memberNumber' in p ? { memberNumber: p.memberNumber } : { ...p.new };
  // A new player with the name of an existing one: ask first (D82).
  if (!data.allowNew) {
    const duplicates = {
      player: 'new' in data.player ? await namesakes(spec(data.player)) : [],
      partner: data.partner && 'new' in data.partner ? await namesakes(spec(data.partner)) : [],
    };
    if (duplicates.player.length || duplicates.partner.length)
      throw new AppError('possibleDuplicate', { duplicates });
  }
  const p1 = await resolvePlayer(spec(data.player), { create: true });
  if (!p1.ok) throw validationError({ [`player.${p1.field}`]: p1.error });
  const p2 = data.partner ? await resolvePlayer(spec(data.partner), { create: true }) : null;
  if (p2 && !p2.ok)
    throw validationError({
      [`partner.${p2.field}`]: p2.error === 'playerNotFound' ? 'partnerNotFound' : p2.error,
    });
  const partner = p2?.ok ? p2.player : null;
  const problem = await entryProblem(t, event, p1.player, partner);
  if (problem) throw validationError({ [problem.field]: problem.error });
  const status = await createEntry(
    actor,
    t,
    event,
    p1.player,
    partner,
    meta,
    'registration.addByOrganiser',
  );
  return {
    status,
    name: [fullName(p1.player), partner ? fullName(partner) : null].filter(Boolean).join(' / '),
    event: eventText(event, actor.locale),
  };
}

/**
 * Player search for the add-entry screen: players who may play this category (and, for the
 * partner, with the chosen player), not yet entered. Organisers see the year of birth to tell
 * namesakes apart.
 */
export async function searchPlayersForEntry(
  actor: Actor,
  tournamentId: string,
  eventId: string,
  query: string,
  partnerOf?: string,
) {
  await assertCanManageTournament(actor, tournamentId);
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (q.length < 2) return [];
  const t = await loadTournament(tournamentId);
  const event = t.events.find((e) => e.id === eventId);
  if (!event) return [];
  const first = partnerOf
    ? await prisma.playerProfile.findFirst({
        where: { memberNumber: partnerOf.toUpperCase(), deletedAt: null },
        select: {
          id: true,
          gender: true,
          dateOfBirth: true,
          levelSingles: { select: { rank: true } },
          levelDoubles: { select: { rank: true } },
          levelMixed: { select: { rank: true } },
        },
      })
    : null;
  const words = q.split(' ');
  const byNumber = /^TE\d{6}$/i.test(q);
  const candidates = await prisma.playerProfile.findMany({
    where: {
      deletedAt: null,
      mergedIntoId: null,
      ...(first ? { id: { not: first.id } } : {}),
      ...(byNumber
        ? { memberNumber: q.toUpperCase() }
        : {
            AND: words.map((w) => ({
              OR: [
                { firstName: { contains: w, mode: 'insensitive' as const } },
                { lastName: { contains: w, mode: 'insensitive' as const } },
                { lastNamePrefix: { contains: w, mode: 'insensitive' as const } },
              ],
            })),
          }),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 40,
    select: { ...eventPlayerSelect, club: { select: { name: true, shortName: true } } },
  });
  const entered = new Set(
    (
      await prisma.registrationParticipant.findMany({
        where: {
          eventId,
          active: true,
          playerId: { in: candidates.map((c) => c.id) },
          registration: { status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] } },
        },
        select: { playerId: true },
      })
    ).map((r) => r.playerId),
  );
  return candidates
    .filter(
      (p) =>
        !entered.has(p.id) &&
        eligibility(p as PlayerRow, event, t.startsOn).length === 0 &&
        (!first || pairEligibility(event.discipline, first as never, p as never).length === 0),
    )
    .slice(0, 10)
    .map((p) => ({
      memberNumber: p.memberNumber,
      name: fullName(p),
      club: p.club?.shortName ?? p.club?.name ?? null,
      born: p.dateOfBirth.getUTCFullYear(),
    }));
}

const eventPlayerSelect = {
  id: true,
  userId: true,
  memberNumber: true,
  firstName: true,
  lastNamePrefix: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  contactEmail: true,
  levelSingles: { select: { rank: true } },
  levelDoubles: { select: { rank: true } },
  levelMixed: { select: { rank: true } },
  user: { select: { email: true, name: true, locale: true } },
} as const;
