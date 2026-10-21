import { PROVINCES } from '@tourneasy/shared/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FilterBar, filterInputClass, Pagination } from '@/components/admin/ui';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { pageParams } from '@/server/lib/validation';
import { listPublicClubs } from '@/server/services/public-service';

const PER_PAGE = 24;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Clubs' });
  const tm = await getTranslations({ locale, namespace: 'MetadataPages' });
  return pageMetadata({ locale, path: '/clubs', title: t('title'), description: tm('clubs') });
}

export default async function ClubsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const q = firstParam(query.q) ?? '';
  const provinceParam = firstParam(query.province);
  const province = (PROVINCES as readonly string[]).includes(provinceParam ?? '')
    ? provinceParam
    : undefined;
  const page = pageParams(Number(firstParam(query.page) ?? 1)).page;
  const result = await listPublicClubs(
    { q, province, limit: PER_PAGE },
    { offset: (page - 1) * PER_PAGE },
  );
  const t = await getTranslations('Clubs');
  const tp = await getTranslations('Public');
  const tprov = await getTranslations('Provinces');
  const qs = (p: number) =>
    new URLSearchParams({
      ...(q ? { q } : {}),
      ...(province ? { province } : {}),
      page: String(p),
    }).toString();

  return (
    <>
      <PageHero title={t('title')} intro={t('intro')} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        <FilterBar action={`/${locale}/clubs`}>
          <label className="sr-only" htmlFor="q">
            {tp('search')}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className={cn(filterInputClass, 'sm:min-w-72')}
          />
          <label className="sr-only" htmlFor="province">
            {tp('allProvinces')}
          </label>
          <select
            id="province"
            name="province"
            defaultValue={province ?? ''}
            className={filterInputClass}
          >
            <option value="">{tp('allProvinces')}</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {tprov(p)}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            {tp('search')}
          </Button>
        </FilterBar>
        <p className="text-sm text-muted-foreground" role="status">
          {tp('results', { count: result.total })}
        </p>
        {result.data.length === 0 ? (
          <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            {t('empty')}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.map((c) => (
              <li
                key={c.slug}
                className="relative rounded-lg border bg-card p-5 text-card-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
              >
                <h2 className="font-heading text-lg font-semibold">
                  <Link
                    href={`/clubs/${c.slug}`}
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {c.name}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[c.city, c.province ? tprov(c.province) : null].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-3 text-sm font-medium">
                  {t('players', { count: c.publicPlayerCount })}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={page}
          pages={Math.max(1, Math.ceil(result.total / PER_PAGE))}
          href={(p) => `/clubs?${qs(p)}`}
        />
      </div>
    </>
  );
}
