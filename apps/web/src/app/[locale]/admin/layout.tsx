import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: LocaleParams & { children: ReactNode }) {
  const locale = await pageLocale(params);
  // Non-admins get a 404, so admin URLs aren't revealed.
  await requireRole(locale, 'ADMIN', `/${locale}/admin`);
  const t = await getTranslations('Admin');
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <nav aria-label={t('nav')} className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin" className="font-semibold hover:underline">
          {t('title')}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/admin/users" className="hover:underline">
          {t('users')}
        </Link>
      </nav>
      {children}
    </div>
  );
}
