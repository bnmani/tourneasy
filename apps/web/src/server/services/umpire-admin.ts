import { prisma } from '@tourneasy/db';
import { assertCanManageTournament } from './permissions';
import type { Actor } from './session-service';

export type UmpireStatus = 'active' | 'expired' | 'revoked';

/** What the admin list shows of a profile: never a PIN, a QR token or a hash. */
export type UmpireListItem = {
  id: string;
  displayName: string;
  status: UmpireStatus;
  expiresAt: Date;
  hasDevice: boolean;
};

export function umpireStatus(
  u: { revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
): UmpireStatus {
  if (u.revokedAt) return 'revoked';
  return u.expiresAt > now ? 'active' : 'expired';
}

/** Umpire profiles of a tournament, for organisers and admins of that tournament. */
export async function listUmpires(
  actor: Actor | null,
  tournamentId: string,
): Promise<UmpireListItem[]> {
  await assertCanManageTournament(actor, tournamentId);
  const rows = await prisma.umpire.findMany({
    where: { tournamentId },
    orderBy: [{ createdAt: 'asc' }, { displayName: 'asc' }],
    // Only these columns leave the database: hashes stay out of reach of the page.
    select: { id: true, displayName: true, revokedAt: true, expiresAt: true, deviceId: true },
  });
  const now = new Date();
  return rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    status: umpireStatus(u, now),
    expiresAt: u.expiresAt,
    hasDevice: u.deviceId !== null,
  }));
}
