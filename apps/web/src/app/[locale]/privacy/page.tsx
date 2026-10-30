import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPage } from '@/components/layout/legal-page';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Legal' });
  return { title: t('privacyTitle') };
}

export default async function PrivacyPolicyPage({ params }: LocaleParams) {
  await pageLocale(params);
  const t = await getTranslations('Legal');
  return <LegalPage title={t('privacyTitle')} updated={t('updated')} body={t('privacyBody')} />;
}
