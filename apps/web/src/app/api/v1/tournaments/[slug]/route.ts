import { apiHandler, publicJson } from '@/server/lib/api';
import { getPublicTournament } from '@/server/services/public-service';

type Context = { params: Promise<{ slug: string }> };

/** GET /api/v1/tournaments/{slug} — tournament details with venue and events. */
export const GET = apiHandler(async (request, { params }: Context) => {
  return publicJson(request, await getPublicTournament((await params).slug));
});
