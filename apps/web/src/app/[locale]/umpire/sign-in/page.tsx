import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'UmpireSignIn' });
  return { title: t('title'), robots: { index: false } };
}

/** Umpires sign in inside the Tourneasy app. This page tells them how, for a scan from the Camera app. */
export default async function UmpireSignInPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'UmpireSignIn' });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('intro')}</p>
      </header>
      <ol className="list-inside list-decimal space-y-2 text-sm">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li>{t('step3')}</li>
      </ol>
      <p className="text-sm text-muted-foreground">{t('noCode')}</p>
    </div>
  );
}
