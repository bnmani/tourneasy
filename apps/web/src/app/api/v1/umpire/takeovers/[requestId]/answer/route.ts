import { z } from 'zod';
import {
  parseBody,
  requireUmpire,
  umpireHandler,
  umpireJson,
  uuidParam,
} from '@/server/lib/umpire-api';
import { answerTakeover } from '@/server/services/umpire-court-service';

const body = z.object({ answer: z.enum(['ACCEPT', 'DECLINE']) }).strict();

/** POST /api/v1/umpire/takeovers/[requestId]/answer — { answer: 'ACCEPT' | 'DECLINE' }. */
export const POST = umpireHandler(
  async (request, { params }: { params: Promise<{ requestId: string }> }) => {
    const session = await requireUmpire(request);
    const requestId = uuidParam((await params).requestId);
    const { answer } = await parseBody(request, body);
    await answerTakeover(session.umpireId, requestId, answer);
    return umpireJson({ ok: true });
  },
);
