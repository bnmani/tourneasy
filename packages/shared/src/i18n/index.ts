import en from './messages/en.json';
import nl from './messages/nl.json';

export const locales = ['nl', 'en'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'nl';

/** All dates/times are shown in the Netherlands' timezone regardless of the viewer's device. */
export const appTimeZone = 'Europe/Amsterdam';

/** Dutch is the source of truth; English must mirror its keys (enforced by a unit test). */
export type Messages = typeof nl;

export const messages: Record<AppLocale, Messages> = { nl, en };

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** BCP 47 tag used for Intl formatting. */
export function intlLocale(locale: AppLocale): string {
  return locale === 'nl' ? 'nl-NL' : 'en-GB';
}

/** Content stored as `{ nl, en? }` JSON (organiser-written text). Falls back to Dutch. */
export type LocalizedText = { nl: string; en?: string };

export function pickLocalized(text: LocalizedText | null | undefined, locale: AppLocale): string {
  if (!text) return '';
  return (locale === 'en' && text.en) || text.nl;
}
