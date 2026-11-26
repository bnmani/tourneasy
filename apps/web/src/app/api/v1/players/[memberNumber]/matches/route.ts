import { apiHandler, publicJson, requestLocale } from '@/server/lib/api';
import { upcomingMatchesOf } from '@/server/services/public-service';

type Context = { params: Promise<{ memberNumber: string }> };

/**
 * GET /api/v1/players/{memberNumber}/matches — a public player's coming matches in published
 * schedules, earliest first (the same list as on their player page).
 */
export const GET = apiHandler(async (request, { params }: Context) => {
  const matches = await upcomingMatchesOf((await params).memberNumber, requestLocale(request));
  return publicJson(request, {
    data: matches.map((m) => ({
      id: m.id,
      status: m.status,
      event: m.event,
      round: m.round,
      a: m.a,
      b: m.b,
      court: m.court,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      tournament: { name: m.tournament.name, slug: m.tournament.slug },
    })),
  });
});
