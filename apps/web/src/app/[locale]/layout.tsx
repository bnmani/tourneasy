import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { routing } from '@/i18n/routing';
import '../globals.css';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f6b45',
};

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
    title: { default: t('title'), template: `%s | ${t('siteName')}` },
    description: t('description'),
    alternates: {
      canonical: `/${locale}`,
      languages: { nl: '/nl', en: '/en', 'x-default': '/nl' },
    },
    openGraph: {
      type: 'website',
      siteName: t('siteName'),
      title: t('title'),
      description: t('description'),
      locale: locale === 'nl' ? 'nl_NL' : 'en_GB',
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Enables static rendering for pages under this locale.
  setRequestLocale(locale);
  const t = await getTranslations('Common');

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            {t('skipToContent')}
          </a>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
