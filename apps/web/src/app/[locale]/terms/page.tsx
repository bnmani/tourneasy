import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/layout/legal-page';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Legal' });
  return { title: t('termsTitle') };
}

export default async function TermsPage({ params }: LocaleParams) {
  await pageLocale(params);
  const t = await getTranslations('Legal');
  return <LegalPage title={t('termsTitle')} updated={t('updated')} body={t('termsBody')} />;
}
