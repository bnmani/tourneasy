import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { requireUmpire, umpireHandler, uuidParam } from '@/server/lib/umpire-api';
import { notifyPaper } from '@/server/services/umpire-scoring-service';

/** POST /api/v1/umpire/matches/[matchId]/paper — the holder reports the match is scored on paper. */
export const POST = umpireHandler(
  async (request, { params }: { params: Promise<{ matchId: string }> }) => {
    const session = await requireUmpire(request);
    const matchId = uuidParam((await params).matchId);
    await notifyPaper(session.umpireId, matchId, requestMetaFromHeaders(request.headers));
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  },
);
