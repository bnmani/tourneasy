import type { Role } from '@tourneasy/db';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { en } from './en';
import { nl } from './nl';
import type { HelpGuide, HelpGuideKey } from './types';

export type { HelpBlock, HelpGuide, HelpGuideKey, HelpImage } from './types';

const guides: Record<AppLocale, Record<HelpGuideKey, HelpGuide>> = { en, nl };

/** The guide as a reader with these roles sees it: owner-only sections need the owner role. */
export function helpGuide(
  locale: AppLocale,
  key: HelpGuideKey,
  roles: readonly Role[] = [],
): HelpGuide {
  const guide = guides[locale][key];
  if (roles.includes('OWNER')) return guide;
  return { ...guide, sections: guide.sections.filter((s) => !s.ownerOnly) };
}

/**
 * Which staff guides a portal user may read (D92): organisers get the organiser guide, admins
 * also the administrator guide. The player guide is public at /help.
 */
export function staffGuides(roles: readonly Role[]): HelpGuideKey[] {
  if (roles.includes('ADMIN')) return ['admins', 'organisers'];
  if (roles.includes('ORGANISER')) return ['organisers'];
  return [];
}
