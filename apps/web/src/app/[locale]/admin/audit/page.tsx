import { auditLabel } from '@/lib/labels';
import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getFormatter, getTranslations } from 'next-intl/server';
import { FilterBar, filterInputClass, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
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

function summary(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
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
  const ta = await getTranslations('AuditActions');
  const format = await getFormatter();
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
      {result.entries.length === 0 ? (
        <p className="text-muted-foreground">{t('audit.empty')}</p>
      ) : (
        <ScrollRegion label={t('audit.title')} className="rounded-lg border bg-card">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t('audit.time')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('audit.actor')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('audit.action')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('audit.entity')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {format.dateTime(e.createdAt, { dateStyle: 'short', timeStyle: 'medium' })}
                  </td>
                  <td className="px-3 py-2">
                    {e.actor ? (
                      <>
                        {e.actor.name}
                        <div className="text-xs text-muted-foreground">{e.actor.email}</div>
                      </>
                    ) : (
                      t('audit.system')
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div>{auditLabel(ta, e.action)}</div>
                    <div className="font-mono text-xs text-muted-foreground">{e.action}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{e.entityType}</div>
                    <div className="max-w-md font-mono text-xs break-all text-muted-foreground">
                      {summary(e.before)} {e.before && e.after ? '→' : ''} {summary(e.after)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      <Pagination page={result.page} pages={result.pages} href={href} />
    </>
  );
}
