import type { publicSchedule } from '../services/schedule-service';

type Item = Awaited<ReturnType<typeof publicSchedule>>['items'][number];

/**
 * A schedule item as the public API shows it: names, court, time, score and status. Internal
 * player ids and check-in details are left out.
 */
export function publicMatch(m: Item) {
  return {
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
  };
}
