import { TOURNAMENT_STATUSES, type TournamentStatusCode } from '@tourneasy/shared/schemas';
import { PerPage } from '@/components/admin/per-page';
import { PAGE_SIZE, pageSize } from '@/server/lib/validation';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, FilterBar, filterInputClass, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { getActor, isPortalUser, requirePortal } from '@/server/auth/web';
import { listTournaments } from '@/server/services/tournament-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  if (!isPortalUser(await getActor())) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: 'Admin.tournaments' });
  return { title: t('title'), robots: { index: false } };
}

export default async function AdminTournamentsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requirePortal(locale);
  const query = await searchParams;
  const q = firstParam(query.q) ?? '';
  const statusParam = firstParam(query.status);
  const status = (TOURNAMENT_STATUSES as readonly string[]).includes(statusParam ?? '')
    ? (statusParam as TournamentStatusCode)
    : undefined;
  const page = Number(firstParam(query.page) ?? 1);
  const perPage = pageSize(Number(firstParam(query.perPage)) || undefined);
  const result = await listTournaments(actor, { q, status, page, perPage });

  const t = await getTranslations('Admin');
  const ts = await getTranslations('TournamentStatuses');
  const tt = await getTranslations('TournamentTypes');
  const format = await getFormatter();
  const filters = { ...(q ? { q } : {}), ...(status ? { status } : {}) };
  const sized = (n: number): Record<string, string> =>
    n === PAGE_SIZE ? {} : { perPage: String(n) };
  const href = (p: number) =>
    `/admin/tournaments?${new URLSearchParams({ ...filters, ...sized(perPage), page: String(p) })}`;
  const sizeHref = (n: number) =>
    `/admin/tournaments?${new URLSearchParams({ ...filters, ...sized(n) })}`;

  return (
    <>
      <PageHeader
        title={t('tournaments.title')}
        actions={
          actor.roles.includes('ADMIN') && (
            <Button asChild>
              <Link href="/admin/tournaments/new">{t('tournaments.new')}</Link>
            </Button>
          )
        }
      />
      <FilterBar action={`/${locale}/admin/tournaments`}>
        <label className="sr-only" htmlFor="q">
          {t('search')}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('tournaments.name')}
          className={filterInputClass}
        />
        <label className="sr-only" htmlFor="status">
          {t('tournaments.status')}
        </label>
        <select id="status" name="status" defaultValue={status ?? ''} className={filterInputClass}>
          <option value="">{t('all')}</option>
          {TOURNAMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ts(s)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t('filter')}
        </Button>
        {perPage !== PAGE_SIZE && <input type="hidden" name="perPage" value={perPage} />}
      </FilterBar>

      <PerPage current={perPage} href={sizeHref} summary={t('total', { count: result.total })} />
      {result.tournaments.length === 0 ? (
        <p className="text-muted-foreground">{t('tournaments.empty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {result.tournaments.map((x) => (
            <li
              key={x.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <Link href={`/admin/tournaments/${x.id}`} className="font-semibold hover:underline">
                  {x.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {format.dateTimeRange(x.startsOn, x.endsOn, {
                    dateStyle: 'medium',
                    timeZone: 'UTC',
                  })}
                  {x.venue && ` · ${x.venue.name}, ${x.venue.city}`}
                  {' · '}
                  {t('tournaments.events')}: {x._count.events}
                </p>
                <p className="text-sm">
                  <span className="font-medium">
                    {x.maxParticipants
                      ? t('tournaments.entriesOf', { count: x.entries, max: x.maxParticipants })
                      : t('tournaments.entriesCount', { count: x.entries })}
                  </span>
                  {x.waitlisted > 0 && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {t('tournaments.waitlistedCount', { count: x.waitlisted })}
                    </span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <Link
                    href={`/admin/tournaments/${x.id}/entries`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t('tournaments.quickEntries')}
                  </Link>
                  <Link
                    href={`/admin/tournaments/${x.id}/matches?view=checkin`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t('tournaments.quickDesk')}
                  </Link>
                  {x.isPublished && (
                    <Link
                      href={`/tournaments/${x.slug}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {t('tournaments.quickPublic')}
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {x.status === 'OPEN' && !x.isPublished && (
                  <Badge tone="muted">⚠ {t('tournaments.openNotPublished')}</Badge>
                )}
                <Badge>{ts(x.status)}</Badge>
                {x.type === 'THIRD_PARTY' && <Badge tone="muted">{tt('THIRD_PARTY')}</Badge>}
                <Badge tone={x.isPublished ? 'primary' : 'muted'}>
                  {x.isPublished ? t('tournaments.published') : t('tournaments.notPublished')}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={result.page} pages={result.pages} href={href} />
    </>
  );
}
