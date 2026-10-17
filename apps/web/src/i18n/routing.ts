import { defaultLocale, locales } from '@tourneasy/shared/i18n';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Always prefix (/nl/..., /en/...) so every page has one canonical, shareable URL per language.
  localePrefix: 'always',
});
