import { managedTournaments } from '@/server/services/tournament-service';
import { formatDayRange } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MyEntries, MyInvites } from '@/components/entry/my-entries';
import { FormError, FormSuccess } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { requireActor } from '@/server/auth/web';
import { getMyAccount } from '@/server/services/profile-service';
import { listFollowing } from '@/server/services/public-service';
import { listMyInvites, listMyRegistrations } from '@/server/services/registration-service';
import { HistoryList } from '@/components/matches/history-list';
import { MatchLine } from '@/components/matches/match-line';
import { myHistory } from '@/server/services/results-service';
import { myMatches } from '@/server/services/schedule-service';
import { PlayerList } from '@/components/public/player-list';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Dashboard' });
  return { title: t('title'), robots: { index: false } };
}

const TABS = ['upcoming', 'past', 'following', 'profile'] as const;
type Tab = (typeof TABS)[number];

export default async function DashboardPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const actor = await requireActor(locale);
  const account = await getMyAccount(actor);
  const managed = (await managedTournaments(actor)).slice(0, 6);
  const t = await getTranslations('Dashboard');
  const tr = await getTranslations('Auth.registered');
  const td = await getTranslations('Disciplines');

  const requested = firstParam(query.tab);
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? '')
    ? (requested as Tab)
    : 'upcoming';
  const tabLabel: Record<Tab, string> = {
    upcoming: t('tabUpcoming'),
    past: t('tabPast'),
    following: t('tabFollowing'),
    profile: t('tabProfile'),
  };
  const profile = account.profile;
  const followed = tab === 'following' ? await listFollowing(actor) : [];
  const entries =
    profile && (tab === 'upcoming' || tab === 'past') ? await listMyRegistrations(actor) : [];
  const invites = profile && tab === 'upcoming' ? await listMyInvites(actor) : [];
  const upcoming = entries.filter((e) => !e.past);
  const past = entries.filter((e) => e.past);
  const status = firstParam(query.status);
  const STATUS_OK = ['entered', 'withdrawn', 'partnerInvited', 'inviteAccepted', 'inviteDeclined'];

  return (
    <div className="space-y-6">
      {firstParam(query.welcome) && (
        <FormSuccess>
          <strong className="block">{tr('title')}</strong>
          {tr('text', { email: account.email })}{' '}
          {profile && tr('memberNumber', { number: profile.memberNumber })}
        </FormSuccess>
      )}

      {status && STATUS_OK.includes(status) && <FormSuccess>{t(status as 'entered')}</FormSuccess>}
      {status && !STATUS_OK.includes(status) && <FormError state={{ error: status }} />}

      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t('welcome', { name: profile?.firstName ?? account.name })}
        </h1>
        {profile && (
          <p className="mt-1 text-muted-foreground">
            {t('memberNumber', { number: profile.memberNumber })}
          </p>
        )}
      </header>

      {managed.length > 0 && (
        <section
          aria-labelledby="managed-title"
          className="space-y-3 rounded-lg border border-primary/30 bg-secondary/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="managed-title" className="text-lg font-semibold">
              {t('managedTitle')}
            </h2>
            <Link
              href="/admin/tournaments"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('managedAll')}
            </Link>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {managed.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDayRange(
                      m.startsOn.toISOString().slice(0, 10),
                      m.endsOn.toISOString().slice(0, 10),
                      locale,
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm">
                    <Link href={`/admin/tournaments/${m.id}`}>{t('manage')}</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/tournaments/${m.id}/matches?view=checkin`}>
                      {t('desk')}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs as links: work without JavaScript and are shareable (?tab=…). */}
      <nav aria-label={t('tabsLabel')} className="border-b">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((key) => (
            <li key={key} className="shrink-0">
              <Link
                href={`/account?tab=${key}`}
                aria-current={tab === key ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium',
                  tab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tabLabel[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={tabLabel[tab]} className="rounded-lg border bg-card p-5 sm:p-6">
        {tab === 'upcoming' && (
          <div className="space-y-6">
            <MyInvites invites={invites} locale={locale} />
            <MyUpcomingMatches actor={actor} locale={locale} />
            {upcoming.length > 0 ? (
              <MyEntries
                entries={upcoming}
                locale={locale}
                showActions
                payFor={firstParam(query.pay)}
              />
            ) : (
              <p className="text-muted-foreground">{t('upcomingEmpty')}</p>
            )}
            <Button asChild variant={upcoming.length > 0 ? 'outline' : 'default'}>
              <Link href="/tournaments">{t('browse')}</Link>
            </Button>
          </div>
        )}
        {tab === 'past' && <MyHistory actor={actor} locale={locale} />}
        {tab === 'past' &&
          (past.length > 0 ? (
            <MyEntries entries={past} locale={locale} showActions={false} />
          ) : (
            <p className="text-muted-foreground">{t('pastEmpty')}</p>
          ))}
        {tab === 'following' &&
          (followed.length === 0 ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">{t('followingEmpty')}</p>
              <Button asChild variant="outline">
                <Link href="/players">{t('findPlayers')}</Link>
              </Button>
            </div>
          ) : (
            <PlayerList players={followed} locale={locale} />
          ))}
        {tab === 'profile' && profile && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{t('contact')}</dt>
              <dd>
                {account.email}
                <br />
                {profile.phone}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('club')}</dt>
              <dd>{profile.club?.name ?? t('none')}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-muted-foreground">{t('preferred')}</dt>
              <dd>
                {profile.preferredDisciplines.length
                  ? profile.preferredDisciplines.map((d) => td(d)).join(', ')
                  : t('none')}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <Button asChild variant="outline">
                <Link href="/account/profile">{t('editProfile')}</Link>
              </Button>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}

/** My scheduled matches (published schedules) with time and court. */
async function MyUpcomingMatches({
  actor,
  locale,
}: {
  actor: Parameters<typeof myMatches>[0];
  locale: AppLocale;
}) {
  const matches = (await myMatches(actor)).filter(
    (m) => !['COMPLETED', 'WALKOVER', 'RETIRED'].includes(m.status),
  );
  if (matches.length === 0) return null;
  const t = await getTranslations('Matches');
  return (
    <section aria-labelledby="my-matches" className="space-y-2">
      <h2 id="my-matches" className="font-heading text-lg font-semibold">
        {t('myMatches')}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {matches.map((m) => (
          <MatchLine key={m.id} item={m} locale={locale}>
            <p className="text-xs text-muted-foreground">{m.tournament.name}</p>
          </MatchLine>
        ))}
      </div>
    </section>
  );
}

async function MyHistory({
  actor,
  locale,
}: {
  actor: Parameters<typeof myHistory>[0];
  locale: AppLocale;
}) {
  const rows = await myHistory(actor);
  if (rows.length === 0) return null;
  const t = await getTranslations('Matches');
  return (
    <section aria-labelledby="my-history" className="mb-6 space-y-2">
      <h2 id="my-history" className="font-heading text-lg font-semibold">
        {t('history')}
      </h2>
      <HistoryList rows={rows} locale={locale} />
    </section>
  );
}
