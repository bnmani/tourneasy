import { apiHandler, publicJson, queryObject } from '@/server/lib/api';
import { listPublicClubs } from '@/server/services/public-service';

/** GET /api/v1/clubs — clubs (q, province, limit, cursor). */
export const GET = apiHandler(async (request) => {
  const { data, nextCursor } = await listPublicClubs(queryObject(request));
  return publicJson(request, { data, nextCursor }, 300);
});
