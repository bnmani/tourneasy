import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { myMatches } from '@/server/services/schedule-service';

/**
 * GET /api/v1/me/matches — my matches in published schedules: upcoming first (by start time),
 * then ones without a time. Internal player ids and check-in details are left out.
 */
export const GET = apiHandler(async (request) => {
  const matches = await myMatches(await requireApiActor(request));
  return json({
    data: matches.map((m) => ({
      id: m.id,
      number: m.number,
      status: m.status,
      event: m.event,
      round: m.round,
      a: m.a,
      b: m.b,
      aClub: m.aClub,
      bClub: m.bClub,
      aEntryId: m.aEntryId,
      bEntryId: m.bEntryId,
      winnerEntryId: m.winnerEntryId,
      sets: m.sets,
      court: m.court,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      changed: m.changed,
      tournament: { name: m.tournament.name, slug: m.tournament.slug },
    })),
  });
});
