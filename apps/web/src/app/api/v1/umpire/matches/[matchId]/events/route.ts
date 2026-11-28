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

const event = z.discriminatedUnion('kind', [
  z
    .object({
      id: z.string().uuid(),
      seq: z.number().int(),
      kind: z.literal('POINT'),
      side: sideSchema,
    })
    .strict(),
  z.object({ id: z.string().uuid(), seq: z.number().int(), kind: z.literal('UNDO') }).strict(),
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
