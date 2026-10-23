import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';
import { Badge, FilterBar, filterInputClass, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { listClubs } from '@/server/services/club-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'clubs.title');
}

export default async function AdminClubsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const query = await searchParams;
  const q = firstParam(query.q) ?? '';
  const archived = firstParam(query.archived) === '1';
  const result = await listClubs(actor, { q, archived, page: Number(firstParam(query.page) ?? 1) });
  const t = await getTranslations('Admin');
  const href = (p: number) =>
    `/admin/clubs?${new URLSearchParams({ ...(q ? { q } : {}), ...(archived ? { archived: '1' } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title={t('clubs.title')}
        actions={
          <Button asChild>
            <Link href="/admin/clubs/new">{t('clubs.new')}</Link>
          </Button>
        }
      />
      <FilterBar action={`/${locale}/admin/clubs`}>
        <label className="sr-only" htmlFor="q">
          {t('search')}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={`${t('clubs.name')} / ${t('clubs.city')}`}
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
      {result.clubs.length === 0 ? (
        <p className="text-muted-foreground">{t('clubs.empty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {result.clubs.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/admin/clubs/${c.id}`} className="font-semibold hover:underline">
                  {c.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {c.city ?? t('none')} · {t('clubs.players', { count: c._count.players })}
                </p>
              </div>
              {c.deletedAt && <Badge tone="muted">{t('archived')}</Badge>}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={result.page} pages={result.pages} href={href} />
    </>
  );
}
