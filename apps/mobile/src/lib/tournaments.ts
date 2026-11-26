import { apiGet } from '@/lib/api';

/** One row of the public tournament list (`GET /tournaments`). */
export type TournamentSummary = {
  slug: string;
  name: string;
  startsOn: string;
  endsOn: string;
  phase: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  venue: { name: string; city: string } | null;
  disciplines: string[];
  eventCount: number;
  feeFromCents: number | null;
  feeToCents: number | null;
  logoUrl: string | null;
};

export type TournamentEvent = {
  id: string;
  discipline: string;
  name: string | null;
  ageCategory: string | null;
  level: string | null;
  feeCents: number;
  maxEntries: number | null;
  drawType: string;
};

/** Full tournament page (`GET /tournaments/{slug}`). */
export type TournamentDetail = Omit<TournamentSummary, 'venue'> & {
  description: string | null;
  dayStartTime: string | null;
  withdrawalDeadline: string | null;
  refundPolicy: string;
  refundPercent: number;
  maxEventsPerPlayer: number | null;
  bundlePricesCents: number[];
  schedulePublished: boolean;
  contact: { name: string | null; email: string | null; phone: string | null };
  venue: {
    name: string;
    street?: string | null;
    houseNumber?: string | null;
    city?: string | null;
  } | null;
  events: TournamentEvent[];
};

export type WhenFilter = 'upcoming' | 'open' | 'past';

type Page<T> = { data: T[]; nextCursor: string | null };

/** Fetch one page of published tournaments. The API answers without an account. */
export function fetchTournaments(params: {
  q?: string;
  when?: WhenFilter;
  cursor?: string;
  limit?: number;
}): Promise<Page<TournamentSummary>> {
  return apiGet<Page<TournamentSummary>>('/tournaments', {
    q: params.q,
    when: params.when,
    cursor: params.cursor,
    limit: params.limit ?? 20,
  });
}

export function fetchTournament(slug: string): Promise<TournamentDetail> {
  return apiGet<TournamentDetail>(`/tournaments/${encodeURIComponent(slug)}`);
}

/** Euro amount in cents, shown as "€15" or "€15–€35". Null when there's no fee. */
export function formatFee(from: number | null, to: number | null, locale: string): string | null {
  if (from === null) return null;
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  if (to === null || to === from) return fmt.format(from / 100);
  return `${fmt.format(from / 100)}–${fmt.format(to / 100)}`;
}
