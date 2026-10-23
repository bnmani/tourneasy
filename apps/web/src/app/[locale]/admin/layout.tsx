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
  const [sending, t] = await Promise.all([
    loadSendingSettings(),
    getTranslations({ locale, namespace: 'Admin.emailSettings' }),
  ]);
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
      {sending?.paused && (
        <p className="mb-6 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-2.5 text-sm font-medium">
          {t('pausedBanner')}{' '}
          {actor.roles.includes('ADMIN') && (
            <Link href="/admin/email" className="underline underline-offset-2">
              {t('pausedBannerLink')}
            </Link>
          )}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <AdminNav isAdmin={actor.roles.includes('ADMIN')} />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
