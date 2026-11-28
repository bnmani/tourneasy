import { requireUmpire, umpireHandler, umpireJson } from '@/server/lib/umpire-api';
import { listIncomingTakeovers } from '@/server/services/umpire-court-service';

/** GET /api/v1/umpire/takeovers/incoming — open take-over requests for courts I hold. */
export const GET = umpireHandler(async (request) => {
  const session = await requireUmpire(request);
  return umpireJson({ requests: await listIncomingTakeovers(session.umpireId) });
});
