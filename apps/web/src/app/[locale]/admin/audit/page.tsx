import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';
import { AuditTable } from '@/components/admin/audit-table';
import { FilterBar, filterInputClass, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { listAuditLog } from '@/server/services/admin-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'navAudit');
}

export default async function AuditLogPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const query = await searchParams;
  const action = firstParam(query.action) ?? '';
  const result = await listAuditLog(actor, { action, page: Number(firstParam(query.page) ?? 1) });
  const t = await getTranslations('Admin');
  const href = (p: number) =>
    `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title={t('audit.title')} intro={t('audit.intro')} />
      <FilterBar action={`/${locale}/admin/audit`}>
        <label className="sr-only" htmlFor="action">
          {t('audit.actionFilter')}
        </label>
        <input
          id="action"
          name="action"
          defaultValue={action}
          placeholder={`${t('audit.actionFilter')} (tournament, user.role …)`}
          className={filterInputClass}
        />
        <Button type="submit" variant="outline">
          {t('filter')}
        </Button>
      </FilterBar>
      <AuditTable entries={result.entries} />
      <Pagination page={result.page} pages={result.pages} href={href} />
    </>
  );
}
