import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { listSessions } from '@/server/services/session-service';

/** GET /api/v1/me/sessions — devices where I'm logged in. */
export const GET = apiHandler(async (request) => {
  return json({ data: await listSessions(await requireApiActor(request)) });
});
