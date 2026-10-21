import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { listMyRegistrations } from '@/server/services/registration-service';

/** GET /api/v1/me/registrations — my entries (upcoming and past) with partner and status. */
export const GET = apiHandler(async (request) => {
  return json({ data: await listMyRegistrations(await requireApiActor(request)) });
});
