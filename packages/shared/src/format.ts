import { appTimeZone, intlLocale, type AppLocale } from './i18n';

/** Format integer cents as EUR, e.g. 1250 → "€ 12,50" (nl) / "€12.50" (en). */
export function formatEuro(cents: number, locale: AppLocale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** Long date in Europe/Amsterdam, e.g. "zaterdag 13 maart 2027". */
export function formatDate(date: Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: appTimeZone,
  }).format(date);
}

/** 24-hour time in Europe/Amsterdam, e.g. "09:30". */
export function formatTime(date: Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: appTimeZone,
  }).format(date);
}

const utcDay = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * Tournament days ("YYYY-MM-DD", stored as UTC dates), e.g. "13–14 mrt 2027" (nl) /
 * "13–14 Mar 2027" (en). A single day prints once.
 */
export function formatDayRange(
  start: string,
  end: string,
  locale: AppLocale,
  month: 'short' | 'long' = 'short',
): string {
  const f = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month,
    year: 'numeric',
    timeZone: 'UTC',
  });
  return start === end ? f.format(utcDay(start)) : f.formatRange(utcDay(start), utcDay(end));
}

/** "november 2026" / "November 2026" for a "YYYY-MM-DD" day. */
export function formatMonthYear(day: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDay(day));
}

/** "€ 15,00" or "€ 15,00 – € 17,50" for a fee range; null when there are no fees. */
export function formatFeeRange(
  from: number | null,
  to: number | null,
  locale: AppLocale,
): string | null {
  if (from === null || to === null) return null;
  return from === to
    ? formatEuro(from, locale)
    : `${formatEuro(from, locale)} – ${formatEuro(to, locale)}`;
}
