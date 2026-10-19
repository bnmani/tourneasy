import { apiHandler, requireApiActor } from '@/server/lib/api';
import { revokeSessionById } from '@/server/services/session-service';

/** POST /api/v1/auth/logout — end the current session (this device only). */
export const POST = apiHandler(async (request) => {
  const actor = await requireApiActor(request);
  await revokeSessionById(actor.sessionId);
  return new Response(null, { status: 204 });
});
