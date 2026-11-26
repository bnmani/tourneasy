import { apiHandler, readJson, requireApiActor } from '@/server/lib/api';
import { registerPushDevice } from '@/server/services/push-service';

/** POST /api/v1/me/push-devices — { token, platform: 'ios' } → 204; this phone gets my pushes. */
export const POST = apiHandler(async (request) => {
  await registerPushDevice(await requireApiActor(request), await readJson(request));
  return new Response(null, { status: 204 });
});
