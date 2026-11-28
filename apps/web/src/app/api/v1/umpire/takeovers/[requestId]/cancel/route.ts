import { requireUmpire, umpireHandler, umpireJson, uuidParam } from '@/server/lib/umpire-api';
import { cancelTakeover } from '@/server/services/umpire-court-service';

/** POST /api/v1/umpire/takeovers/[requestId]/cancel — the requester withdraws an open request. */
export const POST = umpireHandler(
  async (request, { params }: { params: Promise<{ requestId: string }> }) => {
    const session = await requireUmpire(request);
    const requestId = uuidParam((await params).requestId);
    await cancelTakeover(session.umpireId, requestId);
    return umpireJson({ ok: true });
  },
);
