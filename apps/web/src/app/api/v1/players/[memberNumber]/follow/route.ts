import { apiHandler, requireApiActor } from '@/server/lib/api';
import { followPlayer, unfollowPlayer } from '@/server/services/public-service';

type Context = { params: Promise<{ memberNumber: string }> };

/** PUT /api/v1/players/{memberNumber}/follow — follow a public player → 204. */
export const PUT = apiHandler(async (request, { params }: Context) => {
  await followPlayer(await requireApiActor(request), (await params).memberNumber);
  return new Response(null, { status: 204 });
});

/** DELETE /api/v1/players/{memberNumber}/follow — stop following → 204. */
export const DELETE = apiHandler(async (request, { params }: Context) => {
  await unfollowPlayer(await requireApiActor(request), (await params).memberNumber);
  return new Response(null, { status: 204 });
});
