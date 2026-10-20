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
