import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/layout/auth-card';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { getActor, homeFor } from '@/server/auth/web';
import { RegisterForm } from './register-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.register' });
  return { title: t('title') };
}

export default async function RegisterPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const actor = await getActor();
  if (actor) redirect(homeFor(actor, locale));

  const t = await getTranslations('Auth.register');
  return (
    <AuthCard title={t('title')} subtitle={t('subtitle')}>
      <RegisterForm locale={locale} />
    </AuthCard>
  );
}
