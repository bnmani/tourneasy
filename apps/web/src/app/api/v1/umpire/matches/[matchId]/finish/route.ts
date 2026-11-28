import { requireUmpire, umpireHandler, umpireJson, uuidParam } from '@/server/lib/umpire-api';
import { finishMatch } from '@/server/services/umpire-scoring-service';

/** POST /api/v1/umpire/matches/[matchId]/finish — send the decided match to the desk. */
export const POST = umpireHandler(
  async (request, { params }: { params: Promise<{ matchId: string }> }) => {
    const session = await requireUmpire(request);
    const matchId = uuidParam((await params).matchId);
    return umpireJson(await finishMatch(session.umpireId, matchId));
  },
);
