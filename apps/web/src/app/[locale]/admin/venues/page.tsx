import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';
import { Badge, FilterBar, filterInputClass, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { listVenues } from '@/server/services/venue-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'venues.title');
}

export default async function AdminVenuesPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requirePortal(locale);
  const query = await searchParams;
  const q = firstParam(query.q) ?? '';
  const archived = firstParam(query.archived) === '1';
  const result = await listVenues(actor, {
    q,
    archived,
    page: Number(firstParam(query.page) ?? 1),
  });
  const t = await getTranslations('Admin');
  const tp = await getTranslations('Provinces');
  const href = (p: number) =>
    `/admin/venues?${new URLSearchParams({ ...(q ? { q } : {}), ...(archived ? { archived: '1' } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title={t('venues.title')}
        actions={
          <Button asChild>
            <Link href="/admin/venues/new">{t('venues.new')}</Link>
          </Button>
        }
      />
      <FilterBar action={`/${locale}/admin/venues`}>
        <label className="sr-only" htmlFor="q">
          {t('search')}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={`${t('venues.name')} / ${t('venues.city')}`}
          className={filterInputClass}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={archived}
            className="size-4 accent-primary"
          />
          {t('showArchived')}
        </label>
        <Button type="submit" variant="outline">
          {t('filter')}
        </Button>
      </FilterBar>
      {result.venues.length === 0 ? (
        <p className="text-muted-foreground">{t('venues.empty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {result.venues.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/admin/venues/${v.id}`} className="font-semibold hover:underline">
                  {v.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {v.city} · {tp(v.province)} · {t('venues.courts', { count: v.numberOfCourts })}
                </p>
              </div>
              {v.deletedAt && <Badge tone="muted">{t('archived')}</Badge>}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={result.page} pages={result.pages} href={href} />
    </>
  );
}
