import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { FormSuccess } from '@/components/forms/fields';
import { AuthCard } from '@/components/layout/auth-card';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { getActor, homeFor } from '@/server/auth/web';
import { safeRedirectPath } from '@/server/lib/urls';
import { LoginForm } from './login-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.login' });
  return { title: t('title'), robots: { index: false } };
}

export default async function LoginPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const next = safeRedirectPath(firstParam(query.next), '') || undefined;

  const actor = await getActor();
  if (actor) redirect(next ?? homeFor(actor, locale));

  const t = await getTranslations('Auth');
  return (
    <AuthCard title={t('login.title')} subtitle={t('login.subtitle')}>
      {firstParam(query.reset) && (
        <div className="mb-5">
          <FormSuccess>{t('reset.success')}</FormSuccess>
        </div>
      )}
      <LoginForm locale={locale} next={next} />
    </AuthCard>
  );
}
