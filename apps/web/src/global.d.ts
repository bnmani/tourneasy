import type { AppLocale, Messages } from '@tourneasy/shared/i18n';

// Type-safe translation keys and locales for next-intl.
declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
