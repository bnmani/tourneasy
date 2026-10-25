import type { Metadata } from 'next';
import { formatDate } from '@tourneasy/shared';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { personName } from '@/lib/labels';
import { adminMetadata } from '@/lib/seo';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { portalSearch } from '@/server/services/search-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'searchPortal');
}

/** Results of the portal search box (D77). */
export default async function PortalSearchPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const actor = await requirePortal(locale);
  const q = firstParam((await searchParams).q) ?? '';
  const result = await portalSearch(actor, q);
  const t = await getTranslations('Admin');
  const ts = await getTranslations('TournamentStatuses');
  const groups = result
    ? [
        {
          key: 'tournaments',
          title: t('navTournaments'),
          more: `/admin/tournaments?q=${encodeURIComponent(result.q)}`,
          items: result.tournaments.map((x) => ({
            href: `/admin/tournaments/${x.id}`,
            label: x.name,
            meta: `${formatDate(x.startsOn, locale)} · ${ts(x.status)}`,
          })),
        },
        {
          key: 'players',
          title: t('navPlayers'),
          more: `/admin/players?q=${encodeURIComponent(result.q)}`,
          items: result.players.map((x) => ({
            href: `/admin/players/${x.id}`,
            label: personName(x),
            meta: [x.memberNumber, x.club?.name].filter(Boolean).join(' · '),
          })),
        },
        {
          key: 'venues',
          title: t('navVenues'),
          more: `/admin/venues?q=${encodeURIComponent(result.q)}`,
          items: result.venues.map((x) => ({
            href: `/admin/venues/${x.id}`,
            label: x.name,
            meta: x.city,
          })),
        },
        {
          key: 'clubs',
          title: t('navClubs'),
          more: `/admin/clubs?q=${encodeURIComponent(result.q)}`,
          items: result.clubs.map((x) => ({
            href: `/admin/clubs/${x.id}`,
            label: x.name,
            meta: x.city ?? '',
          })),
        },
      ].filter((g) => g.items.length > 0)
    : [];

  return (
    <>
      <PageHeader title={t('searchPortal')} />
      <form action={`/${locale}/admin/search`} role="search" className="flex max-w-xl gap-2">
        <label htmlFor="search-q" className="sr-only">
          {t('searchPortal')}
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('searchPortalHint')}
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
        />
        <Button type="submit">{t('search')}</Button>
      </form>
      {!result ? (
        <p className="text-muted-foreground">{t('searchPortalHint')}</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">{t('searchNoResults', { q: result.q })}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <section
              key={g.key}
              aria-labelledby={`search-${g.key}`}
              className="space-y-2 rounded-lg border bg-card p-4"
            >
              <h2 id={`search-${g.key}`} className="font-semibold">
                {g.title}
              </h2>
              <ul className="divide-y">
                {g.items.map((item) => (
                  <li key={item.href} className="py-2">
                    <Link href={item.href} className="font-medium hover:underline">
                      {item.label}
                    </Link>
                    {item.meta && <p className="text-sm text-muted-foreground">{item.meta}</p>}
                  </li>
                ))}
              </ul>
              {g.items.length >= 8 && (
                <Link href={g.more} className="text-sm text-primary underline underline-offset-2">
                  {t('searchMore')}
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
