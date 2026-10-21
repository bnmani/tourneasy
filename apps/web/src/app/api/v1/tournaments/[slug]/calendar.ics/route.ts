import { apiHandler } from '@/server/lib/api';
import { tournamentIcs } from '@/server/lib/ics';
import { getPublicTournament } from '@/server/services/public-service';

type Context = { params: Promise<{ slug: string }> };

/** GET /api/v1/tournaments/{slug}/calendar.ics — the tournament days as a calendar event. */
export const GET = apiHandler(async (request, { params }: Context) => {
  const { slug } = await params;
  const ics = tournamentIcs(await getPublicTournament(slug), request);
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
});
