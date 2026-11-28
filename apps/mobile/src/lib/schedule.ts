import { apiGet } from '@/lib/api';

/** A match as the schedule APIs send it. Every text field is already in the reader's language. */
export type ScheduleMatch = {
  id: string;
  number: number | null;
  status:
    | 'SCHEDULED'
    | 'CALLED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'WALKOVER'
    | 'RETIRED'
    | 'BYE'
    | 'CANCELLED';
  /** Category, e.g. "Men's singles A". */
  event: string;
  round: string;
  a: string;
  b: string;
  aEntryId: string | null;
  bEntryId: string | null;
  winnerEntryId: string | null;
  sets: { setNumber: number; scoreA: number; scoreB: number }[];
  court: { id: string; number: number; name: string | null } | null;
  startsAt: string | null;
  endsAt: string | null;
  /** 'new' or 'changed' after the schedule was published, else null. */
  changed: 'new' | 'changed' | null;
};

export type TournamentSchedule = {
  published: boolean;
  /** Planned matches, by start time. */
  items: ScheduleMatch[];
  /** Matches without a court and time yet. */
  unplanned: ScheduleMatch[];
};

/** The public schedule of a tournament (GET /tournaments/{slug}/schedule). No account needed. */
export function fetchTournamentSchedule(slug: string, locale: string): Promise<TournamentSchedule> {
  return apiGet<TournamentSchedule>(
    `/tournaments/${encodeURIComponent(slug)}/schedule`,
    undefined,
    undefined,
    { 'Accept-Language': locale },
  );
}

/** Court as text: its name when it has one, else its number. */
export function courtName(court: ScheduleMatch['court']): string | null {
  if (!court) return null;
  return court.name || String(court.number);
}

export const isLive = (m: ScheduleMatch) => m.status === 'IN_PROGRESS' || m.status === 'CALLED';
export const isPlayed = (m: ScheduleMatch) =>
  m.status === 'COMPLETED' || m.status === 'WALKOVER' || m.status === 'RETIRED';
export const isComing = (m: ScheduleMatch) => m.status === 'SCHEDULED';

/** Lower-case text search over both sides, the category, the round and the court. */
export function matchesSearch(m: ScheduleMatch, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [m.a, m.b, m.event, m.round, courtName(m.court) ?? '', m.number ? `#${m.number}` : '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}
