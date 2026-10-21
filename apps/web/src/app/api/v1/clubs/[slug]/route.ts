import { apiHandler, publicJson } from '@/server/lib/api';
import { getPublicClub } from '@/server/services/public-service';

type Context = { params: Promise<{ slug: string }> };

/** GET /api/v1/clubs/{slug} — club with its players who have a public profile. */
export const GET = apiHandler(async (request, { params }: Context) => {
  return publicJson(request, await getPublicClub((await params).slug));
});
