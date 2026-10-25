import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ResendVerificationForm } from '@/components/account/resend-verification';
import { AccountNav } from '@/components/account/account-nav';
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
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <AccountNav isAdmin={actor.roles.includes('ADMIN') || actor.roles.includes('ORGANISER')} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
