import type { AppLocale } from '@tourneasy/shared/i18n';
import type { Metadata } from 'next';

/**
 * Per-page metadata for public pages: title, description, canonical URL, nl/en alternates and
 * Open Graph. `path` is the page path without the locale, e.g. "/tournaments/utrecht-open".
 */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  noindex = false,
}: {
  locale: AppLocale;
  path: string;
  title: string;
  description?: string;
  noindex?: boolean;
}): Metadata {
  const suffix = path === '/' ? '' : path;
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${suffix}`,
      languages: { nl: `/nl${suffix}`, en: `/en${suffix}`, 'x-default': `/nl${suffix}` },
    },
    openGraph: { title, description, url: `/${locale}${suffix}` },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
