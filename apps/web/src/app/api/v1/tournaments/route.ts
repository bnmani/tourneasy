import { apiHandler, publicJson, queryObject } from '@/server/lib/api';
import { listPublicTournaments } from '@/server/services/public-service';

/** GET /api/v1/tournaments — published tournaments (q, province, discipline, when, limit, cursor). */
export const GET = apiHandler(async (request) => {
  const { data, nextCursor } = await listPublicTournaments(queryObject(request));
  return publicJson(request, { data, nextCursor });
});
