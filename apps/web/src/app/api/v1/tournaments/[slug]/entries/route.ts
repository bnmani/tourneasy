import { apiHandler, json, readJson, requireApiActor } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { enterTournament } from '@/server/services/registration-service';

type Context = { params: Promise<{ slug: string }> };

/**
 * POST /api/v1/tournaments/{slug}/entries — enter events:
 * { events: [{ eventId, partner?, lookingForPartner? }], phone?, acceptTerms: true } → 201.
 */
export const POST = apiHandler(async (request, { params }: Context) => {
  const result = await enterTournament(
    await requireApiActor(request),
    (await params).slug,
    await readJson(request),
    requestMetaFromHeaders(request.headers),
  );
  return json(result, { status: 201 });
});
