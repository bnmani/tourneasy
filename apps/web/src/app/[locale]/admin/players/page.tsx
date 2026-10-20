import type { Discipline, Gender } from '@tourneasy/db';
import { DISCIPLINES, GENDERS } from '@tourneasy/shared/schemas';
import { getTranslations } from 'next-intl/server';
import { Badge, FilterBar, filterInputClass, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { personName } from '@/lib/labels';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { getProfileOptions } from '@/server/services/profile-service';
import { listPlayers, playerEmail, type PlayerFilters } from '@/server/services/player-service';

export const metadata = { robots: { index: false } };

export default async function AdminPlayersPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const query = await searchParams;
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const v = firstParam(query[key]);
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : undefined;
  };
  const filters: PlayerFilters = {
    q: firstParam(query.q) ?? '',
    gender: pick('gender', GENDERS) as Gender | undefined,
    discipline: pick('discipline', DISCIPLINES) as Discipline | undefined,
    clubId: firstParam(query.clubId) || undefined,
    account: pick('account', ['with', 'without'] as const),
  };
  const [result, options] = await Promise.all([
    listPlayers(actor, { ...filters, page: Number(firstParam(query.page) ?? 1) }),
    getProfileOptions(),
  ]);
  const t = await getTranslations('Admin');
  const td = await getTranslations('Disciplines');
  const tg = await getTranslations('Genders');
  const filterQuery = new URLSearchParams(
    Object.entries(filters).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
    ),
  );
  const href = (p: number) =>
    `/admin/players?${new URLSearchParams([...filterQuery, ['page', String(p)]])}`;

  return (
    <>
      <PageHeader
        title={t('players.title')}
        intro={t('players.intro')}
        actions={
          <>
            <Button asChild>
              <Link href="/admin/players/new">{t('players.new')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/players/import">{t('players.import')}</Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/v1/admin/players/export?${filterQuery}`} download>
                {t('players.export')}
              </a>
            </Button>
          </>
        }
      />
      <FilterBar action={`/${locale}/admin/players`}>
        <label className="sr-only" htmlFor="q">
          {t('search')}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder={t('players.searchPlaceholder')}
          className={filterInputClass}
        />
        <label className="sr-only" htmlFor="gender">
          {t('players.gender')}
        </label>
        <select
          id="gender"
          name="gender"
          defaultValue={filters.gender ?? ''}
          className={filterInputClass}
        >
          <option value="">
            {t('players.gender')}: {t('all')}
          </option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {tg(g)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="discipline">
          {t('players.discipline')}
        </label>
        <select
          id="discipline"
          name="discipline"
          defaultValue={filters.discipline ?? ''}
          className={filterInputClass}
        >
          <option value="">
            {t('players.discipline')}: {t('all')}
          </option>
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {td(d)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="clubId">
          {t('players.club')}
        </label>
        <select
          id="clubId"
          name="clubId"
          defaultValue={filters.clubId ?? ''}
          className={filterInputClass}
        >
          <option value="">
            {t('players.club')}: {t('all')}
          </option>
          {options.clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="account">
          {t('players.account')}
        </label>
        <select
          id="account"
          name="account"
          defaultValue={filters.account ?? ''}
          className={filterInputClass}
        >
          <option value="">
            {t('players.account')}: {t('all')}
          </option>
          <option value="with">{t('players.withAccount')}</option>
          <option value="without">{t('players.withoutAccount')}</option>
        </select>
        <Button type="submit" variant="outline">
          {t('filter')}
        </Button>
      </FilterBar>

      <p className="text-sm text-muted-foreground">{t('total', { count: result.total })}</p>
      {result.players.length === 0 ? (
        <p className="text-muted-foreground">{t('players.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {t('name')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('players.contact')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('players.gender')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('players.preferred')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('players.club')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.players.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/players/${p.id}`} className="font-medium hover:underline">
                      {personName(p)}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {p.memberNumber}
                      {!p.user && <Badge tone="muted">{t('players.withoutAccount')}</Badge>}
                      {p.isMinor && <Badge tone="muted">{t('players.minor')}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-56 truncate">{playerEmail(p) ?? t('none')}</div>
                    <div className="text-muted-foreground">{p.phone ?? ''}</div>
                  </td>
                  <td className="px-3 py-2">{tg(p.gender)}</td>
                  <td className="px-3 py-2">{p.preferredDisciplines.join(' ') || t('none')}</td>
                  <td className="px-3 py-2">{p.club?.name ?? t('none')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={result.page} pages={result.pages} href={href} />
    </>
  );
}
