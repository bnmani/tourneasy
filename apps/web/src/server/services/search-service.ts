/**
 * One search box for the portal (D77): tournaments, players, venues and clubs by name (players
 * also by member number, email or phone). Organisers find their own tournaments and the venues;
 * players and clubs are for admins.
 */
import { prisma } from '@tourneasy/db';
import { assertPortalAccess, isAdmin } from './permissions';
import { whereFor } from './player-service';
import type { Actor } from './session-service';

const TAKE = 8;

export async function portalSearch(actor: Actor, query: string) {
  assertPortalAccess(actor);
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return null;
  const admin = isAdmin(actor);
  const name = { contains: q, mode: 'insensitive' as const };
  const [tournaments, players, venues, clubs] = await Promise.all([
    prisma.tournament.findMany({
      where: {
        deletedAt: null,
        OR: [{ name }, { slug: { contains: q.toLowerCase() } }],
        ...(admin ? {} : { organisers: { some: { userId: actor.userId } } }),
      },
      orderBy: { startsOn: 'desc' },
      take: TAKE,
      select: { id: true, name: true, startsOn: true, status: true },
    }),
    admin
      ? prisma.playerProfile.findMany({
          where: whereFor({ q }),
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: TAKE,
          select: {
            id: true,
            firstName: true,
            lastNamePrefix: true,
            lastName: true,
            memberNumber: true,
            club: { select: { name: true } },
          },
        })
      : [],
    prisma.venue.findMany({
      where: { deletedAt: null, OR: [{ name }, { city: name }] },
      orderBy: { name: 'asc' },
      take: TAKE,
      select: { id: true, name: true, city: true },
    }),
    admin
      ? prisma.club.findMany({
          where: { deletedAt: null, OR: [{ name }, { city: name }] },
          orderBy: { name: 'asc' },
          take: TAKE,
          select: { id: true, name: true, city: true },
        })
      : [],
  ]);
  return { q, tournaments, players, venues, clubs };
}
