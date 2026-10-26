import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/layout/auth-card';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { readSessionToken } from '@/server/auth/web';
import { pendingMfaSession } from '@/server/services/session-service';
import { VerifyForm } from './verify-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.mfa' });
  return { title: t('title'), robots: { index: false } };
}

/** Step two of the login (D78): the code from the authenticator app, or a recovery code. */
export default async function VerifyLoginPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const token = await readSessionToken();
  if (!token || !(await pendingMfaSession(token))) redirect(`/${locale}/login`);
  const t = await getTranslations('Auth.mfa');
  return (
    <AuthCard title={t('title')}>
      <div className="space-y-5">
        <p className="text-muted-foreground">{t('intro')}</p>
        <VerifyForm
          locale={locale}
          next={firstParam(query.next) ?? ''}
          remember={firstParam(query.remember) === '1'}
        />
        <form action={`/${locale}/logout`} method="post">
          <button type="submit" className="text-sm text-muted-foreground underline">
            {t('cancel')}
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
