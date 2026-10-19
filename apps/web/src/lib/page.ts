import type { AppLocale } from '@tourneasy/shared/i18n';
import { setRequestLocale } from 'next-intl/server';

export type LocaleParams = { params: Promise<{ locale: string }> };
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Resolves the [locale] segment (already validated by the layout) and enables i18n. */
export async function pageLocale(params: LocaleParams['params']): Promise<AppLocale> {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);
  return locale as AppLocale;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
