/** Admin dashboard figures and the audit log viewer. */
import { prisma, type Prisma } from '@tourneasy/db';
import { pageCount, pageParams } from '../lib/validation';
import {
  assertAdmin,
  assertCanManageTournament,
  assertPortalAccess,
  isAdmin,
  isOwner,
  ownerIds,
} from './permissions';
import type { Actor } from './session-service';

export async function getDashboard(actor: Actor) {
  assertPortalAccess(actor);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const mine: Prisma.TournamentWhereInput = isAdmin(actor)
    ? {}
    : { organisers: { some: { userId: actor.userId } } };

  const privacy = await ownerPrivacy(actor);
  const [players, accounts, venues, clubs, byStatus, upcoming, recent] = await Promise.all([
    isAdmin(actor)
      ? prisma.playerProfile.count({ where: { deletedAt: null, mergedIntoId: null } })
      : null,
    isAdmin(actor) ? prisma.user.count({ where: { deletedAt: null, anonymisedAt: null } }) : null,
    isAdmin(actor) ? prisma.venue.count({ where: { deletedAt: null } }) : null,
    isAdmin(actor) ? prisma.club.count({ where: { deletedAt: null } }) : null,
    prisma.tournament.groupBy({
      by: ['status'],
      where: { deletedAt: null, ...mine },
      _count: { _all: true },
    }),
    prisma.tournament.findMany({
      where: { deletedAt: null, endsOn: { gte: today }, status: { not: 'ARCHIVED' }, ...mine },
      orderBy: { startsOn: 'asc' },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        startsOn: true,
        endsOn: true,
        venue: { select: { city: true } },
      },
    }),
    isAdmin(actor)
      ? prisma.auditLog.findMany({
          where: privacy.where,
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            action: true,
            entityType: true,
            createdAt: true,
            actorId: true,
            actor: { select: { name: true } },
          },
        })
      : [],
  ]);
  return {
    players,
    accounts,
    venues,
    clubs,
    tournamentsByStatus: Object.fromEntries(
      byStatus.map((s) => [s.status, s._count._all]),
    ) as Record<string, number>,
    upcoming,
    recent: maskOwners(recent, privacy.owners),
  };
}

/**
 * What admins may see of the log (D78): nothing about owners' accounts or the owner-only
 * settings, and owners' own actions under the name "Tourneasy".
 */
export async function ownerPrivacy(actor: Actor) {
  if (isOwner(actor)) return { where: {}, owners: new Set<string>() };
  const owners = await ownerIds();
  const where: Prisma.AuditLogWhereInput = {
    NOT: [
      { entityType: 'User', entityId: { in: owners } },
      { action: { startsWith: 'settings.payments' } },
      { action: { startsWith: 'settings.email.update' } },
      { action: { startsWith: 'settings.email.clear' } },
      { action: { startsWith: 'settings.unlock' } },
      { action: { startsWith: 'settings.lock' } },
      // Paired with the action, so rows without these JSON fields aren't dropped (SQL NULL).
      { action: 'user.role.grant', after: { path: ['role'], equals: 'OWNER' } },
      { action: 'user.role.revoke', before: { path: ['role'], equals: 'OWNER' } },
    ],
  };
  return { where, owners: new Set(owners) };
}

export function maskOwners<
  T extends { actorId: string | null; actor: { name: string; email?: string } | null },
>(entries: T[], owners: Set<string>): T[] {
  return entries.map((e) =>
    e.actorId && owners.has(e.actorId)
      ? {
          ...e,
          actor: { name: 'Tourneasy', ...(e.actor && 'email' in e.actor ? { email: '' } : {}) },
        }
      : e,
  );
}

export async function listAuditLog(actor: Actor, params: { action?: string; page?: number } = {}) {
  assertAdmin(actor);
  const { page, skip, take } = pageParams(params.page);
  const action = params.action?.trim();
  const privacy = await ownerPrivacy(actor);
  const where: Prisma.AuditLogWhereInput = {
    AND: [action ? { action: { contains: action, mode: 'insensitive' } } : {}, privacy.where],
  };
  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        createdAt: true,
        actorId: true,
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);
  return { entries: maskOwners(entries, privacy.owners), total, page, pages: pageCount(total) };
}

/** Every logged entity that belongs to one tournament: itself, its events, entries, matches… */
async function tournamentAuditScope(tournamentId: string): Promise<Prisma.AuditLogWhereInput> {
  const ids = async (rows: Promise<{ id: string }[]>) => (await rows).map((r) => r.id);
  const event = { tournamentId };
  const [events, registrations, participants, matches, news, orders, refunds] = await Promise.all([
    ids(prisma.tournamentEvent.findMany({ where: event, select: { id: true } })),
    ids(prisma.registration.findMany({ where: { event }, select: { id: true } })),
    ids(
      prisma.registrationParticipant.findMany({
        where: { registration: { event } },
        select: { id: true },
      }),
    ),
    ids(prisma.match.findMany({ where: { draw: { event } }, select: { id: true } })),
    ids(prisma.announcement.findMany({ where: { tournamentId }, select: { id: true } })),
    ids(prisma.order.findMany({ where: { tournamentId }, select: { id: true } })),
    ids(
      prisma.refund.findMany({
        where: { payment: { order: { tournamentId } } },
        select: { id: true },
      }),
    ),
  ]);
  const scoped = Object.entries({
    TournamentEvent: events,
    Registration: registrations,
    RegistrationParticipant: participants,
    Match: matches,
    Announcement: news,
    Order: orders,
    Refund: refunds,
  })
    .filter(([, list]) => list.length > 0)
    .map(([entityType, list]) => ({ entityType, entityId: { in: list } }));
  return { OR: [{ entityType: 'Tournament', entityId: tournamentId }, ...scoped] };
}

/** Change log of one tournament, for its admins and organisers. */
export async function listTournamentAudit(
  actor: Actor,
  tournamentId: string,
  params: { page?: number } = {},
) {
  await assertCanManageTournament(actor, tournamentId);
  const { page, skip, take } = pageParams(params.page);
  const privacy = await ownerPrivacy(actor);
  const where = { AND: [await tournamentAuditScope(tournamentId), privacy.where] };
  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        createdAt: true,
        actorId: true,
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);
  return { entries: maskOwners(entries, privacy.owners), total, page, pages: pageCount(total) };
}
