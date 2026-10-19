import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/layout/auth-card';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { ForgotForm } from './forgot-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.forgot' });
  return { title: t('title'), robots: { index: false } };
}

export default async function ForgotPasswordPage({ params }: LocaleParams) {
  await pageLocale(params);
  const t = await getTranslations('Auth.forgot');
  return (
    <AuthCard title={t('title')} subtitle={t('text')}>
      <ForgotForm />
    </AuthCard>
  );
}
