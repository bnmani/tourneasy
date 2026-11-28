import { z } from 'zod';
import { parseBody, requireUmpire, umpireHandler, umpireJson } from '@/server/lib/umpire-api';
import { requestTakeover } from '@/server/services/umpire-court-service';

const body = z.object({ courtId: z.string().uuid() }).strict();

/** POST /api/v1/umpire/takeovers — { courtId } → the open request, with its 120 second expiry. */
export const POST = umpireHandler(async (request) => {
  const session = await requireUmpire(request);
  const { courtId } = await parseBody(request, body);
  const created = await requestTakeover(session.umpireId, courtId);
  return umpireJson(
    {
      id: created.id,
      courtId: created.courtId,
      status: created.status,
      expiresAt: created.expiresAt,
    },
    201,
  );
});
