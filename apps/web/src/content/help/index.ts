import type { AppLocale } from '@tourneasy/shared/i18n';
import { en } from './en';
import { nl } from './nl';
import type { HelpGuide, HelpGuideKey } from './types';

export type { HelpBlock, HelpGuide, HelpGuideKey, HelpImage } from './types';

const guides: Record<AppLocale, Record<HelpGuideKey, HelpGuide>> = { en, nl };

/** The public guides; the administrator guide lives in the portal (D92). */
export const PUBLIC_GUIDES = ['players', 'organisers'] as const satisfies HelpGuideKey[];

export function helpGuide(locale: AppLocale, key: HelpGuideKey): HelpGuide {
  return guides[locale][key];
}
