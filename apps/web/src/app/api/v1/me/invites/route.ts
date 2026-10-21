import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { listMyInvites } from '@/server/services/registration-service';

/** GET /api/v1/me/invites — partner invitations waiting for my answer. */
export const GET = apiHandler(async (request) => {
  return json({ data: await listMyInvites(await requireApiActor(request)) });
});
