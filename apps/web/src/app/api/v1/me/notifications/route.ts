import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { listMyNotifications } from '@/server/services/inbox-service';

/** GET /api/v1/me/notifications — my latest 50 messages, newest first, and the unread count. */
export const GET = apiHandler(async (request) => {
  return json({ data: await listMyNotifications(await requireApiActor(request)) });
});
