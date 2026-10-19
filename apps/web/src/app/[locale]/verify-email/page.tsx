import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FormSuccess } from '@/components/forms/fields';
import { ResendVerificationForm } from '@/components/account/resend-verification';
import { AuthCard } from '@/components/layout/auth-card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { getActor } from '@/server/auth/web';
import { verifyEmail } from '@/server/services/auth-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.verify' });
  return { title: t('title'), robots: { index: false }, referrer: 'no-referrer' };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  await pageLocale(params);
  const token = firstParam((await searchParams).token);
  const t = await getTranslations('Auth.verify');
  const th = await getTranslations('Header');

  let verified = false;
  if (token) {
    verified = await verifyEmail({ token }).then(
      () => true,
      () => false,
    );
  }
  // Mail scanners sometimes open the link first and use up the token; if the address is
  // already confirmed, say so instead of showing an error.
  const actor = await getActor();
  verified ||= actor?.emailVerified === true;

  return (
    <AuthCard title={t('title')}>
      {verified ? (
        <div className="space-y-5">
          <FormSuccess>{t('success')}</FormSuccess>
          <Button asChild>
            <Link href={actor ? '/account' : '/login'}>
              {actor ? th('dashboard') : th('login')}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <p role="alert" className="text-destructive">
            {t('failed')}
          </p>
          {actor ? (
            <ResendVerificationForm />
          ) : (
            <p className="text-muted-foreground">{t('loginToResend')}</p>
          )}
        </div>
      )}
    </AuthCard>
  );
}
