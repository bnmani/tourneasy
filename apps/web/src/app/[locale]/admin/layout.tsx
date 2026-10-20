import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/admin-nav';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: LocaleParams & { children: ReactNode }) {
  const locale = await pageLocale(params);
  // Admins and delegated organisers; everyone else gets a 404 (admin URLs aren't revealed).
  const actor = await requirePortal(locale, `/${locale}/admin`);
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <AdminNav isAdmin={actor.roles.includes('ADMIN')} />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
