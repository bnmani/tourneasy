import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { nl } from '@/lib/i18n-nl';

export type Locale = 'en' | 'nl';

type LocaleValue = {
  locale: Locale;
  setLocale: (value: Locale) => void;
};

// Without a provider (for example in isolated tests) the app stays in English.
const LocaleContext = createContext<LocaleValue>({ locale: 'en', setLocale: () => {} });

/**
 * Language choice for the whole app. Held in memory for now, so it resets on
 * restart; it moves to stored preferences with the rest of the settings.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  return useContext(LocaleContext);
}

export type TranslateFn = (text: string, values?: Record<string, string | number>) => string;

/**
 * Translate a string. The English text is the key, so an untranslated string
 * still reads correctly. `{name}` placeholders are filled from `values`.
 */
export function translate(
  locale: Locale,
  text: string,
  values?: Record<string, string | number>,
): string {
  const template = locale === 'nl' ? (nl[text] ?? text) : text;
  if (!values) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function useT(): TranslateFn {
  const { locale } = useLocale();
  return useCallback((text, values) => translate(locale, text, values), [locale]);
}

/** BCP 47 tag for date formatting. */
export function dateLocaleTag(locale: Locale): string {
  return locale === 'nl' ? 'nl-NL' : 'en-GB';
}
