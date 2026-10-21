import { actorFromRequest } from '@/server/auth/web';
import { apiHandler, json, publicJson } from '@/server/lib/api';
import { getPublicPlayer } from '@/server/services/public-service';

type Context = { params: Promise<{ memberNumber: string }> };

/**
 * GET /api/v1/players/{memberNumber} — a public player profile. Signed-in callers also get
 * `following` and `isSelf` (and the response is then private).
 */
export const GET = apiHandler(async (request, { params }: Context) => {
  const viewer = await actorFromRequest(request);
  const result = await getPublicPlayer((await params).memberNumber, viewer);
  return viewer ? json(result) : publicJson(request, { player: result.player });
});
