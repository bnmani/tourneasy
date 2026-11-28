import { z } from 'zod';
import {
  parseBody,
  requireUmpire,
  sideSchema,
  umpireHandler,
  umpireJson,
  uuidParam,
} from '@/server/lib/umpire-api';
import { startMatch } from '@/server/services/umpire-scoring-service';

const body = z.object({ serving: sideSchema }).strict();

/** POST /api/v1/umpire/matches/[matchId]/start — { serving: 'A' | 'B' } → { ok: true }. */
export const POST = umpireHandler(
  async (request, { params }: { params: Promise<{ matchId: string }> }) => {
    const session = await requireUmpire(request);
    const matchId = uuidParam((await params).matchId);
    const { serving } = await parseBody(request, body);
    await startMatch(session.umpireId, matchId, serving);
    return umpireJson({ ok: true });
  },
);
