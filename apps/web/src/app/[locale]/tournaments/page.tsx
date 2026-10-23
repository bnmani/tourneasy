import { DISCIPLINES, PROVINCES, TOURNAMENT_WHEN } from '@tourneasy/shared/schemas';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FilterBar, filterInputClass, Pagination } from '@/components/admin/ui';
import { TournamentCard } from '@/components/public/tournament-card';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { pageParams } from '@/server/lib/validation';
import { listPublicTournaments } from '@/server/services/public-service';

const PER_PAGE = 12;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Tournaments' });
  const tm = await getTranslations({ locale, namespace: 'MetadataPages' });
  return pageMetadata({
    locale,
    path: '/tournaments',
    title: t('title'),
    description: tm('tournaments'),
  });
}

export default async function TournamentsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const v = firstParam(query[key]);
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : undefined;
  };
  const filters = {
    q: firstParam(query.q) ?? '',
    province: pick('province', PROVINCES),
    discipline: pick('discipline', DISCIPLINES),
  };
  const when = pick('when', TOURNAMENT_WHEN) ?? 'upcoming';
  const page = pageParams(Number(firstParam(query.page) ?? 1)).page;
  const result = await listPublicTournaments(
    { ...filters, when, limit: PER_PAGE },
    { offset: (page - 1) * PER_PAGE },
  );
  const pages = Math.max(1, Math.ceil(result.total / PER_PAGE));

  const t = await getTranslations('Tournaments');
  const tp = await getTranslations('Public');
  const tprov = await getTranslations('Provinces');
  const td = await getTranslations('Disciplines');

  const qs = (extra: Record<string, string>) =>
    new URLSearchParams(
      Object.entries({ ...filters, when, ...extra }).filter(
        (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
      ),
    ).toString();
  const tabs = [
    { key: 'upcoming', label: t('tabUpcoming') },
    { key: 'open', label: t('tabOpen') },
    { key: 'past', label: t('tabPast') },
  ] as const;

  return (
    <>
      <PageHero title={t('title')} intro={t('intro')} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        <nav aria-label={t('tabsLabel')}>
          <ul className="flex gap-1 overflow-x-auto border-b">
            {tabs.map((tab) => (
              <li key={tab.key} className="shrink-0">
                <Link
                  href={`/tournaments?${qs({ when: tab.key })}`}
                  aria-current={when === tab.key ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold',
                    when === tab.key
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <FilterBar action={`/${locale}/tournaments`} persistent={['when']}>
          <input type="hidden" name="when" value={when} />
          <label className="sr-only" htmlFor="q">
            {tp('search')}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q}
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
            defaultValue={filters.province ?? ''}
            className={filterInputClass}
          >
            <option value="">{tp('allProvinces')}</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {tprov(p)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="discipline">
            {tp('allEvents')}
          </label>
          <select
            id="discipline"
            name="discipline"
            defaultValue={filters.discipline ?? ''}
            className={filterInputClass}
          >
            <option value="">{tp('allEvents')}</option>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {td(d)}
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
            {result.data.map((tournament) => (
              <li key={tournament.slug}>
                <TournamentCard tournament={tournament} locale={locale} heading="h2" />
              </li>
            ))}
          </ul>
        )}

        <Pagination
          page={page}
          pages={pages}
          href={(p) => `/tournaments?${qs({ page: String(p) })}`}
        />
      </div>
    </>
  );
}
