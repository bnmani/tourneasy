import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/admin-nav';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { loadSendingSettings } from '@/server/email/mailer';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: LocaleParams & { children: ReactNode }) {
  const locale = await pageLocale(params);
  // Admins and delegated organisers; everyone else gets a 404 (admin URLs aren't revealed).
  const actor = await requirePortal(locale, `/${locale}/admin`);
  const [sending, t, ta] = await Promise.all([
    loadSendingSettings(),
    getTranslations({ locale, namespace: 'Admin.emailSettings' }),
    getTranslations({ locale, namespace: 'Admin' }),
  ]);
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
      {sending?.paused && (
        <p className="mb-6 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-2.5 text-sm font-medium">
          {t('pausedBanner')}{' '}
          {actor.roles.includes('OWNER') && (
            <Link href="/admin/email" className="underline underline-offset-2">
              {t('pausedBannerLink')}
            </Link>
          )}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <div className="min-w-0 space-y-3">
          <form action={`/${locale}/admin/search`} role="search" className="flex">
            <label htmlFor="portal-search" className="sr-only">
              {ta('searchPortal')}
            </label>
            <input
              id="portal-search"
              name="q"
              type="search"
              placeholder={ta('searchPortal')}
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
            />
          </form>
          <AdminNav
            isAdmin={actor.roles.includes('ADMIN')}
            isOwner={actor.roles.includes('OWNER')}
          />
        </div>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
