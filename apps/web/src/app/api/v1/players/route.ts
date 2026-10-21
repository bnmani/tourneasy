import { apiHandler, publicJson, queryObject } from '@/server/lib/api';
import { listPublicPlayers } from '@/server/services/public-service';

/** GET /api/v1/players — players with a public profile (q, limit, cursor). */
export const GET = apiHandler(async (request) => {
  const { data, nextCursor } = await listPublicPlayers(queryObject(request));
  return publicJson(request, { data, nextCursor });
});
