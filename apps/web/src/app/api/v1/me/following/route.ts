import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { listFollowing } from '@/server/services/public-service';

/** GET /api/v1/me/following — the public players I follow, newest first. */
export const GET = apiHandler(async (request) => {
  return json({ data: await listFollowing(await requireApiActor(request)) });
});
