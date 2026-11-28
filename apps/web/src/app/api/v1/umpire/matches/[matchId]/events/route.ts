import { z } from 'zod';
import {
  parseBody,
  requireUmpire,
  sideSchema,
  umpireHandler,
  umpireJson,
  uuidParam,
} from '@/server/lib/umpire-api';
import { postEvents } from '@/server/services/umpire-scoring-service';

const MAX_EVENTS = 200;
/** seq is stored as a Postgres integer: 1 up to its maximum. */
const seq = z.number().int().min(1).max(2_147_483_647);

const event = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().uuid(),
      seq,
      kind: z.literal('POINT'),
      side: sideSchema,
    })
    .strict(),
  z.object({ id: z.string().uuid(), seq, kind: z.literal('UNDO') }).strict(),
]);
const body = z.object({ events: z.array(event).max(MAX_EVENTS) }).strict();

/** POST /api/v1/umpire/matches/[matchId]/events — { events: [...] } → the service result. */
export const POST = umpireHandler(
  async (request, { params }: { params: Promise<{ matchId: string }> }) => {
    const session = await requireUmpire(request);
    const matchId = uuidParam((await params).matchId);
    const { events } = await parseBody(request, body);
    return umpireJson(await postEvents(session.umpireId, matchId, events));
  },
);
