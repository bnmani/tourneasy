import { apiHandler, requireApiActor } from '@/server/lib/api';
import { removePushDevice } from '@/server/services/push-service';

type Context = { params: Promise<{ token: string }> };

/** DELETE /api/v1/me/push-devices/{token} — this phone stops getting my pushes → 204. */
export const DELETE = apiHandler(async (request, { params }: Context) => {
  await removePushDevice(await requireApiActor(request), (await params).token);
  return new Response(null, { status: 204 });
});
