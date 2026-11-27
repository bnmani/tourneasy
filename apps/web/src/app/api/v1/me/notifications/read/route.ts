import { apiHandler, requireApiActor } from '@/server/lib/api';
import { readOptionalJson } from '@/server/lib/request-body';
import { markMyNotificationsRead } from '@/server/services/inbox-service';

/** POST /api/v1/me/notifications/read — { ids? } → 204; no ids marks all of mine read. */
export const POST = apiHandler(async (request) => {
  await markMyNotificationsRead(await requireApiActor(request), await readOptionalJson(request));
  return new Response(null, { status: 204 });
});
