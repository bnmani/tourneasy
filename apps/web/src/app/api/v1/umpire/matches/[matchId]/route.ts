import { requireUmpire, umpireHandler, umpireJson, uuidParam } from '@/server/lib/umpire-api';
import { getMatchState } from '@/server/services/umpire-scoring-service';

/** GET /api/v1/umpire/matches/[matchId] — { status, version, games, serving, lastSeq }. */
export const GET = umpireHandler(
  async (request, { params }: { params: Promise<{ matchId: string }> }) => {
    const session = await requireUmpire(request);
    const matchId = uuidParam((await params).matchId);
    return umpireJson(await getMatchState(session.umpireId, matchId));
  },
);
