import { apiHandler, publicJson, requestLocale } from '@/server/lib/api';
import { publicMatch } from '@/server/lib/public-match';
import { publicSchedule } from '@/server/services/schedule-service';

type Context = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/tournaments/{slug}/schedule — the published schedule: every planned match by time
 * (`items`) and the ones without a court and time yet (`unplanned`), with status and score.
 * `published: false` before the organiser publishes it. Cached for 15 seconds: it's live.
 */
export const GET = apiHandler(async (request, { params }: Context) => {
  const schedule = await publicSchedule((await params).slug, requestLocale(request));
  return publicJson(
    request,
    {
      published: schedule.published,
      items: schedule.items.map(publicMatch),
      unplanned: schedule.unplanned.map(publicMatch),
    },
    15,
  );
});
