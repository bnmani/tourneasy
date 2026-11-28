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

/** Text the organiser wrote in both languages. Either one can be missing. */
export type Localized = { nl?: string; en?: string } | null;

/**
 * The text in the reader's language, else the other one, else null. Never render a
 * Localized value directly: React Native crashes on an object inside <Text>.
 */
export function pickLocale(value: Localized | string | undefined, locale: string): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value || null;
  const preferred = locale === 'nl' ? value.nl : value.en;
  const other = locale === 'nl' ? value.en : value.nl;
  return preferred?.trim() || other?.trim() || null;
}

export type TournamentEvent = {
  id: string;
  discipline: string;
  /** Custom name; otherwise the label is built from discipline, age and level. */
  name: Localized;
  ageCategory: { code: string; name: Localized } | null;
  level: string | null;
  feeCents: number;
  maxEntries: number | null;
  drawType: string;
};

/** Full tournament page (`GET /tournaments/{slug}`). */
export type TournamentDetail = Omit<TournamentSummary, 'venue'> & {
  description: Localized;
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
    postcode?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  events: TournamentEvent[];
};

/**
 * Google Maps directions to a venue, the same link the website uses: coordinates when the venue
 * has them, otherwise its name and address.
 */
export function venueDirectionsUrl(v: {
  name: string;
  street?: string | null;
  houseNumber?: string | null;
  postcode?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  const destination =
    v.latitude != null && v.longitude != null
      ? `${v.latitude},${v.longitude}`
      : [
          v.name,
          [v.street, v.houseNumber].filter(Boolean).join(' '),
          [v.postcode, v.city].filter(Boolean).join(' '),
        ]
          .filter(Boolean)
          .join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

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
  // Whole euros without cents (€15), otherwise exact (€7.50), so a fee is never rounded.
  const format = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  if (to === null || to === from) return format(from);
  return `${format(from)}–${format(to)}`;
}
