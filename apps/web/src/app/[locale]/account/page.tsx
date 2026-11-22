import { managedTournaments } from '@/server/services/tournament-service';
import { formatDayRange, formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { MyEntries, MyInvites } from '@/components/entry/my-entries';
import { FormError, FormSuccess } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { requireActor } from '@/server/auth/web';
import { getMyAccount } from '@/server/services/profile-service';
import { myOpenFoodOrders } from '@/server/services/food-service';
import { followedMatches, listFollowing } from '@/server/services/public-service';
import type { Actor } from '@/server/services/session-service';
import { listMyInvites, listMyRegistrations } from '@/server/services/registration-service';
import { HistoryList } from '@/components/matches/history-list';
import { ExpectedKnockoutLines } from '@/components/matches/expected-knockout';
import { MatchesByDay } from '@/components/matches/matches-by-day';
import { myHistory } from '@/server/services/results-service';
import { myExpectedKnockout } from '@/server/services/expected-knockout-service';
import { myMatches } from '@/server/services/schedule-service';
import { PlayerList } from '@/components/public/player-list';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Dashboard' });
  return { title: t('title'), robots: { index: false } };
}

const TABS = ['upcoming', 'schedule', 'past', 'following', 'profile'] as const;
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
    schedule: t('tabSchedule'),
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
          {firstParam(query.welcome) === 'activated'
            ? tr('activated')
            : tr('text', { email: account.email })}{' '}
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
        // Closed by default, so on a phone the dashboard itself comes first.
        <details className="group rounded-lg border border-primary/30 bg-secondary/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
            <h2 className="text-lg font-semibold">
              {t('managedTitle')}{' '}
              <span className="font-normal text-muted-foreground">({managed.length})</span>
            </h2>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
            <Link
              href="/admin/tournaments"
              className="inline-block text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('managedAll')}
            </Link>
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
          </div>
        </details>
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
            <MyFoodOrders actor={actor} locale={locale} />
            <Button asChild variant={upcoming.length > 0 ? 'outline' : 'default'}>
              <Link href="/tournaments">{t('browse')}</Link>
            </Button>
          </div>
        )}
        {tab === 'schedule' && <MySchedule actor={actor} locale={locale} />}
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
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('followingScheduleHint')}{' '}
                <Link href="/account?tab=schedule" className="font-medium text-primary underline">
                  {t('tabSchedule')}
                </Link>
              </p>
              <PlayerList players={followed} locale={locale} />
            </div>
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

/**
 * Food & drink to collect (D87): the pickup code and where to collect, so the player can show it
 * at the counter. Only orders paid, or to pay at pickup, that aren't handed out yet.
 */
async function MyFoodOrders({ actor, locale }: { actor: Actor; locale: AppLocale }) {
  const orders = await myOpenFoodOrders(actor);
  if (orders.length === 0) return null;
  const t = await getTranslations('Dashboard');
  const tf = await getTranslations('Food.player');
  return (
    <section aria-labelledby="my-food" className="space-y-3">
      <h2 id="my-food" className="font-heading text-lg font-semibold">
        {t('foodTitle')}
      </h2>
      <ul className="divide-y rounded-md border">
        {orders.map((o) => (
          <li key={o.id} className="space-y-1 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-semibold">{o.orderNumber}</code>
              <span className="font-medium">{o.tournament.name}</span>
              <span className="text-muted-foreground">
                {o.status === 'PAID' ? tf('statusPaid') : tf('statusPayAtPickup')}
              </span>
            </div>
            <p className="text-muted-foreground">
              {o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')} ·{' '}
              {formatEuro(o.totalCents, locale)}
            </p>
            {o.tournament.foodPickupInfo && (
              <p className="text-muted-foreground">
                {tf('pickup')}: {o.tournament.foodPickupInfo}
              </p>
            )}
            <Link
              href={`/tournaments/${o.tournament.slug}/food`}
              className="font-medium text-primary underline underline-offset-4"
            >
              {t('foodShowCode')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * My schedule (D81): my coming matches per day, and those of the players I follow. Only
 * published schedules; played matches are under "Past tournaments".
 */
async function MySchedule({
  actor,
  locale,
}: {
  actor: Parameters<typeof myMatches>[0];
  locale: AppLocale;
}) {
  const [mine, followed] = await Promise.all([
    myMatches(actor).then((all) =>
      all.filter((m) => !['COMPLETED', 'WALKOVER', 'RETIRED'].includes(m.status)),
    ),
    followedMatches(actor),
  ]);
  const t = await getTranslations('Dashboard');
  return (
    <div className="space-y-8">
      <section aria-labelledby="my-matches" className="space-y-3">
        <h2 id="my-matches" className="font-heading text-lg font-semibold">
          {t('scheduleMine')}
        </h2>
        {mine.length > 0 ? (
          <MatchesByDay items={mine} locale={locale} />
        ) : (
          <p className="text-muted-foreground">{t('scheduleMineEmpty')}</p>
        )}
      </section>
      <Suspense fallback={null}>
        <MyExpectedKnockout actor={actor} locale={locale} />
      </Suspense>
      {followed.length > 0 && (
        <section aria-labelledby="followed-matches" className="space-y-4">
          <h2 id="followed-matches" className="font-heading text-lg font-semibold">
            {t('scheduleFollowed')}
          </h2>
          {followed.map((p) => (
            <div key={p.memberNumber} className="space-y-2 rounded-lg border p-4">
              <h3 className="font-semibold">
                <Link href={`/players/${p.memberNumber}`} className="hover:underline">
                  {p.name}
                </Link>
              </h3>
              <MatchesByDay items={p.matches} locale={locale} />
            </div>
          ))}
        </section>
      )}
    </div>
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

/** Loads after the matches, so My schedule opens first (D124). */
async function MyExpectedKnockout({
  actor,
  locale,
}: {
  actor: Parameters<typeof myMatches>[0];
  locale: AppLocale;
}) {
  const expected = await myExpectedKnockout(actor, locale);
  return <ExpectedKnockoutLines tournaments={expected} locale={locale} />;
}
