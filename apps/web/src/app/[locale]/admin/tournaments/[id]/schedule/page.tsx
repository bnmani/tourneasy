import { formatDate, formatTime, utcToAmsterdamLocal } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { filterInputClass, PageHeader, StatusNotice } from '@/components/admin/ui';
import { MatchLine } from '@/components/matches/match-line';
import { ExportMenu } from '@/components/export-menu';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import {
  moveMatchAction,
  proposeScheduleAction,
  publishScheduleAction,
  swapMatchAction,
  unscheduleMatchAction,
} from '@/server/actions/match-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { Suspense } from 'react';
import { SwapMatch, SwapOptionsProvider } from '@/components/admin/swap-match';
import { ExpectedKnockoutList } from '@/components/matches/expected-knockout';
import { NowButton, QuickButton } from '@/components/desk/quick-buttons';
import { quickExpectedKnockoutAction } from '@/server/actions/match-actions';
import {
  expectedKnockout,
  hybridDraws,
  isExpectedKnockoutOn,
} from '@/server/services/expected-knockout-service';
import { getSchedule } from '@/server/services/schedule-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.schedule' });
  return { title: t('title'), robots: { index: false } };
}

/** Organisers: propose, adjust and publish the schedule (D56). */
export default async function SchedulePage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const schedule = await getSchedule(actor, id, locale).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!schedule) notFound();
  const query = await searchParams;
  const ts = await getTranslations('Admin.schedule');
  const { tournament, courts, days, scheduled, unscheduled, playedUnplanned, conflictIds } =
    schedule;
  const published = !!tournament.schedulePublishedAt;
  const expectedOn = await isExpectedKnockoutOn(id);
  const byDay = days.map((d) => ({
    ...d,
    items: scheduled.filter((s) => utcToAmsterdamLocal(s.startsAt!).slice(0, 10) === d.date),
  }));
  const allItems = [...scheduled, ...unscheduled, ...playedUnplanned];
  // Once for the page, not once per card (D124).
  const swapOptions = scheduled
    .filter((o) => o.status === 'SCHEDULED')
    .map((o) => ({
      id: o.id,
      label: `#${o.number} · ${formatTime(o.startsAt!, locale)} · ${o.event}`,
    }));

  return (
    <SwapOptionsProvider options={swapOptions}>
      <PageHeader
        title={ts('heading', { tournament: tournament.name })}
        intro={ts('intro')}
        actions={
          <>
            <ExportMenu
              label={ts('export')}
              className={buttonVariants()}
              items={[
                {
                  kind: 'pdf',
                  label: ts('exportPdf'),
                  href: `/api/v1/tournaments/${tournament.slug}/schedule.pdf?lang=${locale}`,
                },
                {
                  kind: 'xlsx',
                  label: ts('exportXlsx'),
                  href: `/api/v1/tournaments/${tournament.slug}/schedule.xlsx?lang=${locale}`,
                },
                {
                  kind: 'courts',
                  label: ts('exportCourts'),
                  href: `/api/v1/tournaments/${tournament.slug}/courts.pdf?lang=${locale}`,
                },
              ]}
            />
            <Button asChild variant="outline">
              <Link href={`/admin/tournaments/${id}/matches`}>{ts('desk')}</Link>
            </Button>
          </>
        }
      />
      <StatusNotice
        status={firstParam(query.status)}
        params={{ unscheduled: firstParam(query.unscheduled) ?? '0' }}
      />

      <section className="space-y-3 rounded-lg border bg-card p-4 text-sm sm:p-6">
        <p>
          {ts('settings', {
            minutes: tournament.matchMinutes,
            single: tournament.singleGameMinutes,
            rest: tournament.restMinutes,
            courts: courts.length,
            start: tournament.dayStartTime ?? '09:00',
            end: tournament.dayEndTime ?? '22:00',
          })}{' '}
          <Link href={`/admin/tournaments/${id}`} className="underline underline-offset-4">
            {ts('changeSettings')}
          </Link>
        </p>
        {!tournament.venue && <p className="text-destructive">{ts('noVenue')}</p>}
        <div className="flex flex-wrap gap-2">
          <form action={proposeScheduleAction.bind(null, locale, id, 'all')}>
            <Button type="submit">{scheduled.length ? ts('proposeAgain') : ts('propose')}</Button>
          </form>
          {scheduled.length > 0 && unscheduled.length > 0 && (
            <form action={proposeScheduleAction.bind(null, locale, id, 'remaining')}>
              <Button type="submit" variant="outline">
                {ts('proposeRemaining')}
              </Button>
            </form>
          )}
          {scheduled.length > 0 && (
            <form action={publishScheduleAction.bind(null, locale, id, !published)}>
              <Button type="submit" variant="outline">
                {published ? ts('unpublish') : ts('publish')}
              </Button>
            </form>
          )}
        </div>
        <p className="text-muted-foreground">
          {published ? ts('isPublished') : ts('notPublished')}
        </p>
        {conflictIds.size > 0 && (
          <p className="text-destructive">{ts('conflicts', { count: conflictIds.size })}</p>
        )}
      </section>

      {unscheduled.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            {ts('unscheduled', { count: unscheduled.length })}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((item) => (
              <MatchLine key={item.id} item={item} locale={locale}>
                {courts.length > 0 && (
                  <form
                    action={moveMatchAction.bind(null, locale, id, item.id)}
                    className="flex flex-wrap items-end gap-2 text-xs"
                  >
                    <select
                      name="courtId"
                      aria-label={ts('court')}
                      className={cn(filterInputClass, 'sm:w-auto')}
                    >
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {ts('courtNumber', { number: c.number })}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      name="startsAt"
                      required
                      aria-label={ts('time')}
                      defaultValue={`${days[0]?.date ?? ''}T${tournament.dayStartTime ?? '09:00'}`}
                      className={cn(filterInputClass, 'sm:w-auto')}
                    />
                    <NowButton label={ts('now')} />
                    <Button type="submit" size="sm" variant="outline">
                      {ts('place')}
                    </Button>
                  </form>
                )}
              </MatchLine>
            ))}
          </div>
        </section>
      )}

      {byDay.map((day) =>
        day.items.length === 0 ? null : (
          <section key={day.date} className="space-y-3">
            <h2 className="text-lg font-semibold">{formatDate(day.start, locale)}</h2>
            {[...new Set(day.items.map((i) => i.startsAt!.getTime()))].map((time) => (
              <div key={time} className="grid gap-2 sm:grid-cols-[4rem_1fr]">
                <p className="pt-3 font-semibold tabular-nums">
                  {formatTime(new Date(time), locale)}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {day.items
                    .filter((i) => i.startsAt!.getTime() === time)
                    .sort((a, b) => a.court!.number - b.court!.number)
                    .map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          conflictIds.has(item.id) && 'rounded-md ring-2 ring-destructive',
                        )}
                      >
                        <MatchLine item={item} locale={locale} showTime={false}>
                          {conflictIds.has(item.id) && (
                            <p className="text-xs text-destructive">{ts('restConflict')}</p>
                          )}
                          {item.status === 'SCHEDULED' && (
                            <details className="text-xs">
                              <summary className="cursor-pointer font-medium text-primary">
                                {ts('adjust')}
                              </summary>
                              <form
                                action={moveMatchAction.bind(null, locale, id, item.id)}
                                className="mt-2 flex flex-wrap items-end gap-2"
                              >
                                <select
                                  name="courtId"
                                  defaultValue={item.court!.id}
                                  aria-label={ts('court')}
                                  className={cn(filterInputClass, 'sm:w-auto')}
                                >
                                  {courts.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {ts('courtNumber', { number: c.number })}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="datetime-local"
                                  name="startsAt"
                                  aria-label={ts('time')}
                                  defaultValue={utcToAmsterdamLocal(item.startsAt!)}
                                  className={cn(filterInputClass, 'sm:w-auto')}
                                />
                                <NowButton label={ts('now')} />
                                <Button type="submit" size="sm" variant="outline">
                                  {ts('move')}
                                </Button>
                              </form>
                              <SwapMatch
                                itemId={item.id}
                                action={swapMatchAction.bind(null, locale, id, item.id)}
                                labels={{ summary: ts('swapWith'), button: ts('swap') }}
                                selectClassName={cn(filterInputClass, 'sm:w-auto')}
                              />
                              <form
                                action={unscheduleMatchAction.bind(null, locale, id, item.id)}
                                className="mt-2"
                              >
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                >
                                  {ts('remove')}
                                </Button>
                              </form>
                            </details>
                          )}
                        </MatchLine>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </section>
        ),
      )}
      {playedUnplanned.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            {ts('playedUnplanned', { count: playedUnplanned.length })}
          </h2>
          <p className="text-sm text-muted-foreground">{ts('playedUnplannedHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {playedUnplanned.map((item) => (
              <MatchLine key={item.id} item={item} locale={locale} />
            ))}
          </div>
        </section>
      )}
      <section className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {expectedOn ? ts('expectedOn') : ts('expectedOff')} {ts('expectedHint')}
        </p>
        <QuickButton
          size="sm"
          variant="outline"
          action={quickExpectedKnockoutAction.bind(null, id, !expectedOn)}
        >
          {expectedOn ? ts('expectedHide') : ts('expectedShow')}
        </QuickButton>
      </section>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            {ts('expectedLoading')}
          </p>
        }
      >
        <ExpectedSection
          tournamentId={id}
          locale={locale}
          showDay={tournament.startsOn.getTime() !== tournament.endsOn.getTime()}
        />
      </Suspense>
      {allItems.length === 0 && <p className="text-muted-foreground">{ts('empty')}</p>}
    </SwapOptionsProvider>
  );
}

/** The expected knockout rounds load after the schedule, so the page itself opens first (D124). */
async function ExpectedSection({
  tournamentId,
  locale,
  showDay,
}: {
  tournamentId: string;
  locale: AppLocale;
  showDay: boolean;
}) {
  const [expected, draws] = await Promise.all([
    expectedKnockout(tournamentId, locale),
    hybridDraws(tournamentId, locale),
  ]);
  return (
    <ExpectedKnockoutList categories={expected} draws={draws} locale={locale} showDay={showDay} />
  );
}
