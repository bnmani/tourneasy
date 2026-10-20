import {
  messages,
  pickLocalized,
  type AppLocale,
  type LocalizedText,
} from '@tourneasy/shared/i18n';

type EventLike = {
  discipline: keyof (typeof messages)['nl']['Disciplines'];
  name: unknown;
  ageCategory?: { code: string; name: unknown } | null;
  levelClass?: { code: string } | null;
};

/** "Herenenkel · Senioren · A", or the organiser's custom name. */
export function eventLabel(event: EventLike, locale: AppLocale): string {
  const custom = pickLocalized(event.name as LocalizedText | null, locale);
  if (custom) return custom;
  return [
    messages[locale].Disciplines[event.discipline],
    event.ageCategory
      ? pickLocalized(event.ageCategory.name as LocalizedText, locale) || event.ageCategory.code
      : null,
    event.levelClass?.code,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function personName(p: {
  firstName: string;
  lastNamePrefix: string | null;
  lastName: string;
}): string {
  return [p.firstName, p.lastNamePrefix, p.lastName].filter(Boolean).join(' ');
}
