import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/layout/auth-card';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { getPlayerInvite } from '@/server/services/player-invite-service';
import { ActivateForm } from './activate-form';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Auth.activate' });
  // The token is in the URL: keep the page out of indexes and referrers.
  return { title: t('title'), robots: { index: false }, referrer: 'no-referrer' };
}

/** Where an invited player without an account picks a password (D76). */
export default async function ActivatePage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const token = firstParam((await searchParams).token) ?? '';
  const invite = token.length >= 20 ? await getPlayerInvite(token) : null;
  const t = await getTranslations('Auth.activate');
  return (
    <AuthCard title={t('title')}>
      {invite ? (
        <div className="space-y-5">
          <p className="text-muted-foreground">
            {t('intro', {
              name: invite.firstName,
              number: invite.memberNumber,
              email: invite.email,
            })}
          </p>
          <ActivateForm locale={locale} token={token} minor={invite.minor} />
        </div>
      ) : (
        <div className="space-y-4">
          <p role="alert" className="text-destructive">
            {t('invalid')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/login">{t('login')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/register">{t('register')}</Link>
            </Button>
          </div>
        </div>
      )}
    </AuthCard>
  );
}
