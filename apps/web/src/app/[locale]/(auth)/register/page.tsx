import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/layout/auth-card';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { getActor, homeFor } from '@/server/auth/web';
import { safeRedirectPath } from '@/server/lib/urls';
import { RegisterForm } from './register-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.register' });
  return { title: t('title') };
}

export default async function RegisterPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  // Where to continue after sign-up, e.g. the entry form of a tournament (D45).
  const next = safeRedirectPath(firstParam((await searchParams).next), '') || undefined;
  const actor = await getActor();
  if (actor) redirect(next ?? homeFor(actor, locale));

  const t = await getTranslations('Auth.register');
  return (
    <AuthCard title={t('title')} subtitle={t('subtitle')}>
      <RegisterForm locale={locale} next={next} />
    </AuthCard>
  );
}
