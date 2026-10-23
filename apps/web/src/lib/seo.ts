import type { AppLocale } from '@tourneasy/shared/i18n';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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

/** Admin pages: the page's own title from the Admin texts, never indexed. */
export async function adminMetadata(
  params: Promise<{ locale: string }>,
  key: string,
): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as AppLocale, namespace: 'Admin' });
  return { title: t(key as 'navAudit'), robots: { index: false } };
}
