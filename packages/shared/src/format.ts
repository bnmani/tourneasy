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
