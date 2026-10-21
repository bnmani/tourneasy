/**
 * Importing participants into a tournament (admins, D53): an Excel or CSV file with one row per
 * entry, or the participants export itself (partner rows follow their entrant). Players must
 * already exist (player import first). The usual eligibility and pair rules apply; the entry
 * window and the per-player maximum don't (the organiser decides). Full events put the entry on
 * the waiting list. No emails are sent: players see the entries on their dashboard.
 */
import { Prisma, prisma, type RegistrationStatus } from '@tourneasy/db';
import { isDoubles, pairEligibility, parseCsvObjects } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { randomToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { looksLikeXlsx, readXlsx, toXlsx } from '../lib/xlsx';
import { assertAdmin } from './permissions';
import {
  ACTIVE,
  activeCounts,
  eligibility,
  eventSelect,
  eventText,
  playerEntries,
  playerSelect,
  type EventRow,
  type PlayerRow,
} from './registration-service';
import type { Actor } from './session-service';

export const ENTRY_IMPORT_COLUMNS = [
  'event',
  'memberNumber',
  'email',
  'partnerMemberNumber',
  'partnerEmail',
] as const;

const MAX_ROWS = 2000;

export type EntryImportResult = {
  created: number;
  waitlisted: number;
  skipped: number;
  errors: { line: number; field: string; error: string }[];
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

/** Player by member number ("TE100023") or email (account or contact email). */
async function findPlayer(memberNumber?: string, email?: string): Promise<PlayerRow | null> {
  if (memberNumber) {
    return prisma.playerProfile.findFirst({
      where: { memberNumber: memberNumber.toUpperCase(), deletedAt: null },
      select: playerSelect,
    });
  }
  if (email) {
    const e = email.toLowerCase();
    return prisma.playerProfile.findFirst({
      where: { deletedAt: null, OR: [{ user: { email: e } }, { contactEmail: e }] },
      select: playerSelect,
    });
  }
  return null;
}

type Planned = {
  line: number;
  event: EventRow;
  player: { memberNumber?: string; email?: string };
  partner: { memberNumber?: string; email?: string } | null;
};

export async function importTournamentEntries(
  actor: Actor,
  tournamentId: string,
  bytes: Uint8Array,
  meta: RequestMeta,
): Promise<EntryImportResult> {
  assertAdmin(actor);
  const t = await loadTournament(tournamentId);
  const rows = readRows(bytes).filter((r) => Object.values(r).some((v) => v !== ''));
  if (rows.length === 0 || !('event' in rows[0]!)) throw new AppError('csvInvalid');
  if (!('membernumber' in rows[0]!) && !('email' in rows[0]!)) throw new AppError('csvInvalid');
  if (rows.length > MAX_ROWS) throw new AppError('csvInvalid', { max: MAX_ROWS });

  // Events by their label in either language (as in the export), or by id.
  const eventByKey = new Map<string, EventRow>();
  for (const e of t.events) {
    eventByKey.set(e.id, e);
    eventByKey.set(eventText(e, 'nl').toLowerCase(), e);
    eventByKey.set(eventText(e, 'en').toLowerCase(), e);
  }

  const result: EntryImportResult = { created: 0, waitlisted: 0, skipped: 0, errors: [] };
  const fail = (line: number, field: string, error: string) => {
    result.errors.push({ line, field, error });
    result.skipped += 1;
  };

  // Rows → entries. In the participants export a partner has its own row (role PARTNER)
  // right after the entrant; cancelled rows are left out.
  const planned: Planned[] = [];
  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    if (row.status === 'CANCELLED') continue;
    const event = eventByKey.get((row.event ?? '').toLowerCase());
    const who = {
      memberNumber: row.membernumber || undefined,
      email: row.email || undefined,
    };
    if (row.role === 'PARTNER') {
      const last = planned[planned.length - 1];
      if (last && last.event.id === event?.id && !last.partner) last.partner = who;
      else fail(line, 'role', 'invalid');
      continue;
    }
    if (!event) {
      fail(line, 'event', 'eventNotFound');
      continue;
    }
    if (!who.memberNumber && !who.email) {
      fail(line, 'memberNumber', 'required');
      continue;
    }
    const partner =
      row.partnermembernumber || row.partneremail
        ? {
            memberNumber: row.partnermembernumber || undefined,
            email: row.partneremail || undefined,
          }
        : null;
    planned.push({ line, event, player: who, partner });
  }

  for (const plan of planned) {
    const { line, event } = plan;
    const player = await findPlayer(plan.player.memberNumber, plan.player.email);
    if (!player) {
      fail(line, 'memberNumber', 'playerNotFound');
      continue;
    }
    const doubles = isDoubles(event.discipline);
    if (plan.partner && !doubles) {
      fail(line, 'partnerMemberNumber', 'invalid');
      continue;
    }
    const partner = plan.partner
      ? await findPlayer(plan.partner.memberNumber, plan.partner.email)
      : null;
    if (plan.partner && !partner) {
      fail(line, 'partnerMemberNumber', 'partnerNotFound');
      continue;
    }
    if (partner?.id === player.id) {
      fail(line, 'partnerMemberNumber', 'partnerSelf');
      continue;
    }
    if (eligibility(player, event, t.startsOn).length > 0) {
      fail(line, 'memberNumber', 'notEligible');
      continue;
    }
    if (
      partner &&
      [
        ...eligibility(partner, event, t.startsOn),
        ...pairEligibility(event.discipline, player, partner),
      ].length > 0
    ) {
      fail(line, 'partnerMemberNumber', 'partnerIneligible');
      continue;
    }
    if ((await playerEntries(player.id, t.id)).has(event.id)) {
      fail(line, 'memberNumber', 'alreadyEntered');
      continue;
    }
    if (partner && (await playerEntries(partner.id, t.id)).has(event.id)) {
      fail(line, 'partnerMemberNumber', 'partnerAlreadyEntered');
      continue;
    }

    try {
      const status = await prisma.$transaction(async (tx) => {
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
          action: 'registration.import',
          entityType: 'Registration',
          entityId: registration.id,
          after: { eventId: event.id, status, waitlistPosition },
          meta,
        });
        return status;
      });
      if (status === 'WAITLISTED') result.waitlisted += 1;
      else result.created += 1;
    } catch (error) {
      // The partial unique index catches a duplicate row in the same file.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        fail(line, 'memberNumber', 'alreadyEntered');
      } else throw error;
    }
  }

  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'registration.importFile',
    entityType: 'Tournament',
    entityId: t.id,
    after: { created: result.created, waitlisted: result.waitlisted, skipped: result.skipped },
    meta,
  });
  return result;
}

/** Example file with this tournament's event names. */
export async function entryImportTemplate(actor: Actor, tournamentId: string) {
  assertAdmin(actor);
  const t = await loadTournament(tournamentId);
  const rows = t.events
    .slice(0, 3)
    .map((e) => [
      eventText(e, 'nl'),
      'TE100001',
      '',
      isDoubles(e.discipline) ? 'TE100002' : '',
      '',
    ]);
  return toXlsx('Deelnemers', [...ENTRY_IMPORT_COLUMNS], rows);
}
