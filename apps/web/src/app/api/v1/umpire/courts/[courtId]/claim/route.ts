import { requireUmpire, umpireHandler, umpireJson, uuidParam } from '@/server/lib/umpire-api';
import { claimCourt, releaseCourt } from '@/server/services/umpire-court-service';

type Context = { params: Promise<{ courtId: string }> };

/** POST /api/v1/umpire/courts/[courtId]/claim — hold this court; 409 COURT_HELD when taken. */
export const POST = umpireHandler(async (request, { params }: Context) => {
  const session = await requireUmpire(request);
  await claimCourt(session.umpireId, uuidParam((await params).courtId));
  return umpireJson({ ok: true });
});

/** DELETE /api/v1/umpire/courts/[courtId]/claim — let go of the court I hold. */
export const DELETE = umpireHandler(async (request, { params }: Context) => {
  const session = await requireUmpire(request);
  await releaseCourt(session.umpireId, uuidParam((await params).courtId));
  return umpireJson({ ok: true });
});
