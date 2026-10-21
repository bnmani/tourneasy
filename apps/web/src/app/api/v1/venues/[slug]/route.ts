import { apiHandler, publicJson } from '@/server/lib/api';
import { getPublicVenue } from '@/server/services/public-service';

type Context = { params: Promise<{ slug: string }> };

/** GET /api/v1/venues/{slug} — venue, its upcoming tournaments and home clubs. */
export const GET = apiHandler(async (request, { params }: Context) => {
  return publicJson(request, await getPublicVenue((await params).slug));
});
