import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/layout/auth-card';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { ResetForm } from './reset-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.reset' });
  // The token is in the URL: keep the page out of indexes and referrers.
  return { title: t('title'), robots: { index: false }, referrer: 'no-referrer' };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const token = firstParam((await searchParams).token);
  const t = await getTranslations('Auth');
  return (
    <AuthCard title={t('reset.title')}>
      {token ? (
        <ResetForm locale={locale} token={token} />
      ) : (
        <div className="space-y-4">
          <p role="alert" className="text-destructive">
            {t('reset.missingToken')}
          </p>
          <Link
            href="/forgot-password"
            className="font-medium text-primary underline underline-offset-4"
          >
            {t('verify.resend')}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
