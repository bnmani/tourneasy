import { apiHandler, publicJson, queryObject } from '@/server/lib/api';
import { listPublicVenues } from '@/server/services/public-service';

/** GET /api/v1/venues — venues (q, province, limit, cursor). */
export const GET = apiHandler(async (request) => {
  const { data, nextCursor } = await listPublicVenues(queryObject(request));
  return publicJson(request, { data, nextCursor }, 300);
});
