import { requireUmpire, umpireHandler, umpireJson } from '@/server/lib/umpire-api';
import { listCourts } from '@/server/services/umpire-court-service';

/** GET /api/v1/umpire/courts — the courts of my tournament and who holds them. */
export const GET = umpireHandler(async (request) => {
  const session = await requireUmpire(request);
  return umpireJson({ courts: await listCourts(session.tournamentId, session.umpireId) });
});
