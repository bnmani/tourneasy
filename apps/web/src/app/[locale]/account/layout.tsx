import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ResendVerificationForm } from '@/components/account/resend-verification';
import { AccountNav } from '@/components/account/account-nav';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireActor } from '@/server/auth/web';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
  params,
}: LocaleParams & { children: ReactNode }) {
  const locale = await pageLocale(params);
  const actor = await requireActor(locale, `/${locale}/account`);
  const t = await getTranslations('Auth.verify');
  const ta = await getTranslations('Account');

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      {!actor.emailVerified && (
        <div
          role="status"
          className="mb-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm">{t('banner')}</p>
          <ResendVerificationForm compact />
        </div>
      )}
      {actor.mfaSetupRequired && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-amber-500/60 bg-amber-500/10 p-4 text-sm font-medium"
        >
          {ta('mfaBanner')}{' '}
          <Link href="/account/security#two-step" className="underline underline-offset-2">
            {ta('mfaBannerLink')}
          </Link>
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <AccountNav isAdmin={actor.roles.includes('ADMIN') || actor.roles.includes('ORGANISER')} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
