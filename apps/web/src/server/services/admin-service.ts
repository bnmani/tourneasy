/** Admin dashboard figures and the audit log viewer. */
import { prisma, type Prisma } from '@tourneasy/db';
import { pageCount, pageParams } from '../lib/validation';
import { assertAdmin, assertCanManageTournament, assertPortalAccess, isAdmin } from './permissions';
import type { Actor } from './session-service';

export async function getDashboard(actor: Actor) {
  assertPortalAccess(actor);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const mine: Prisma.TournamentWhereInput = isAdmin(actor)
    ? {}
    : { organisers: { some: { userId: actor.userId } } };

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
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            action: true,
            entityType: true,
            createdAt: true,
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
    recent,
  };
}

export async function listAuditLog(actor: Actor, params: { action?: string; page?: number } = {}) {
  assertAdmin(actor);
  const { page, skip, take } = pageParams(params.page);
  const action = params.action?.trim();
  const where: Prisma.AuditLogWhereInput = action
    ? { action: { contains: action, mode: 'insensitive' } }
    : {};
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
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);
  return { entries, total, page, pages: pageCount(total) };
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
  const where = await tournamentAuditScope(tournamentId);
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
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);
  return { entries, total, page, pages: pageCount(total) };
}
