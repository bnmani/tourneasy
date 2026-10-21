import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FilterBar, filterInputClass, Pagination } from '@/components/admin/ui';
import { PlayerList } from '@/components/public/player-list';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { pageParams } from '@/server/lib/validation';
import { listPublicPlayers } from '@/server/services/public-service';

const PER_PAGE = 30;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Players' });
  const tm = await getTranslations({ locale, namespace: 'MetadataPages' });
  // Player listings stay out of search engines (privacy by default, D30/D46).
  return pageMetadata({
    locale,
    path: '/players',
    title: t('title'),
    description: tm('players'),
    noindex: true,
  });
}

export default async function PlayersPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const q = firstParam(query.q) ?? '';
  const page = pageParams(Number(firstParam(query.page) ?? 1)).page;
  const result = await listPublicPlayers({ q, limit: PER_PAGE }, { offset: (page - 1) * PER_PAGE });
  const t = await getTranslations('Players');
  const tp = await getTranslations('Public');
  const qs = (p: number) =>
    new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString();

  return (
    <>
      <PageHero title={t('title')} intro={t('intro')} />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-10">
        <FilterBar action={`/${locale}/players`}>
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
            className={cn(filterInputClass, 'sm:min-w-80')}
          />
          <Button type="submit" variant="outline">
            {tp('search')}
          </Button>
        </FilterBar>
        <p className="text-sm text-muted-foreground">{t('privacy')}</p>
        <p className="text-sm text-muted-foreground" role="status">
          {tp('results', { count: result.total })}
        </p>
        {result.data.length === 0 ? (
          <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            {t('empty')}
          </p>
        ) : (
          <PlayerList players={result.data} locale={locale} />
        )}
        <Pagination
          page={page}
          pages={Math.max(1, Math.ceil(result.total / PER_PAGE))}
          href={(p) => `/players?${qs(p)}`}
        />
      </div>
    </>
  );
}
