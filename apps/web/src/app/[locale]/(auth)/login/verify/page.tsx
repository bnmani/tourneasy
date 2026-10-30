import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/layout/auth-card';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { readSessionToken } from '@/server/auth/web';
import { mfaMethods } from '@/server/services/mfa-service';
import { pendingMfaSession } from '@/server/services/session-service';
import { PasskeyLogin } from './passkey-login';
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
  const pending = token ? await pendingMfaSession(token) : null;
  if (!pending) redirect(`/${locale}/login`);
  const methods = await mfaMethods(pending.userId);
  const t = await getTranslations('Auth.mfa');
  const next = firstParam(query.next) ?? '';
  const remember = firstParam(query.remember) === '1';
  return (
    <AuthCard title={t('title')}>
      <div className="space-y-5">
        <p className="text-muted-foreground">
          {methods.passkeys > 0 ? (methods.app ? t('introBoth') : t('introPasskey')) : t('intro')}
        </p>
        {/* A passkey first when there is one (D88); the code form stays as the alternative. */}
        {methods.passkeys > 0 && <PasskeyLogin locale={locale} next={next} remember={remember} />}
        {methods.passkeys > 0 && (
          <p className="text-center text-xs tracking-wide text-muted-foreground uppercase">
            {t('or')}
          </p>
        )}
        <VerifyForm locale={locale} next={next} remember={remember} app={methods.app} />
        <form action={`/${locale}/logout`} method="post">
          <button type="submit" className="text-sm text-muted-foreground underline">
            {t('cancel')}
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
