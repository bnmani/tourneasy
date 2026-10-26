/**
 * Authorization rules for the admin portal. ADMIN can do everything; ORGANISER only acts
 * on tournaments they are assigned to (TournamentOrganiser). Checked in every service call.
 */
import { prisma, Role } from '@tourneasy/db';
import { AppError } from '../lib/errors';
import type { Actor } from './session-service';

export function isAdmin(actor: Actor | null): boolean {
  return !!actor?.roles.includes(Role.ADMIN);
}

/** Owners (D78): payment and email server settings, and who else is an owner. */
export function isOwner(actor: Actor | null): boolean {
  return !!actor?.roles.includes(Role.OWNER);
}

export function assertOwner(actor: Actor | null): asserts actor is Actor {
  if (!actor) throw new AppError('unauthorized');
  // Unknown to everyone else, like admin pages are to organisers.
  if (!actor.roles.includes(Role.OWNER)) throw new AppError('notFound');
}

/** Roles another person may see: the owner role only shows to owners. */
export function visibleRoles<R extends string>(viewer: Actor, roles: R[]): R[] {
  return isOwner(viewer) ? roles : roles.filter((r) => r !== Role.OWNER);
}

/** User ids of all owners, for hiding and protecting them from admins. */
export async function ownerIds(): Promise<string[]> {
  return (
    await prisma.userRole.findMany({ where: { role: Role.OWNER }, select: { userId: true } })
  ).map((r) => r.userId);
}

/** Admins can't change, lock or remove an owner; to them it isn't there (D78). */
export async function assertNotHiddenOwner(actor: Actor, userId: string): Promise<void> {
  if (isOwner(actor)) return;
  const owner = await prisma.userRole.count({ where: { userId, role: Role.OWNER } });
  if (owner) throw new AppError('notFound');
}

export function assertAdmin(actor: Actor | null): asserts actor is Actor {
  if (!actor) throw new AppError('unauthorized');
  if (!actor.roles.includes(Role.ADMIN)) throw new AppError('forbidden');
}

/** Admins and organisers may open the portal; organisers see only their tournaments. */
export function assertPortalAccess(actor: Actor | null): asserts actor is Actor {
  if (!actor) throw new AppError('unauthorized');
  if (!actor.roles.includes(Role.ADMIN) && !actor.roles.includes(Role.ORGANISER)) {
    throw new AppError('forbidden');
  }
}

export async function canManageTournament(actor: Actor, tournamentId: string): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (!actor.roles.includes(Role.ORGANISER)) return false;
  const link = await prisma.tournamentOrganiser.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: actor.userId } },
  });
  return link !== null;
}

export async function assertCanManageTournament(
  actor: Actor | null,
  tournamentId: string,
): Promise<Actor> {
  if (!actor) throw new AppError('unauthorized');
  // Unknown and not-mine look the same, so ids can't be probed.
  if (!(await canManageTournament(actor, tournamentId))) throw new AppError('notFound');
  return actor;
}
