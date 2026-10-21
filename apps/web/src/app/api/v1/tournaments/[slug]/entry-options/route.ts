import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { getEntryOptions } from '@/server/services/registration-service';

type Context = { params: Promise<{ slug: string }> };

/** GET /api/v1/tournaments/{slug}/entry-options — events with my eligibility, places and fees. */
export const GET = apiHandler(async (request, { params }: Context) => {
  return json(await getEntryOptions(await requireApiActor(request), (await params).slug));
});
