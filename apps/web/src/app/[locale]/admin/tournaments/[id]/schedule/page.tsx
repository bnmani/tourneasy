import { formatDate, formatTime, utcToAmsterdamLocal } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { filterInputClass, PageHeader, StatusNotice } from '@/components/admin/ui';
import { MatchLine } from '@/components/matches/match-line';
import { Button } from '@/components/ui/button';
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
  const t = await getTranslations('Admin');
  const ts = await getTranslations('Admin.schedule');
  const { tournament, courts, days, scheduled, unscheduled, conflictIds } = schedule;
  const published = !!tournament.schedulePublishedAt;
  const byDay = days.map((d) => ({
    ...d,
    items: scheduled.filter((s) => utcToAmsterdamLocal(s.startsAt!).slice(0, 10) === d.date),
  }));
  const allItems = [...scheduled, ...unscheduled];

  return (
    <>
      <PageHeader
        title={ts('heading', { tournament: tournament.name })}
        intro={ts('intro')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/admin/tournaments/${id}/matches`}>{ts('desk')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/admin/tournaments/${id}`}>{t('back')}</Link>
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
                                <Button type="submit" size="sm" variant="outline">
                                  {ts('move')}
                                </Button>
                              </form>
                              <form
                                action={swapMatchAction.bind(null, locale, id, item.id)}
                                className="mt-2 flex flex-wrap items-end gap-2"
                              >
                                <select
                                  name="other"
                                  aria-label={ts('swapWith')}
                                  className={cn(filterInputClass, 'sm:w-auto')}
                                >
                                  {scheduled
                                    .filter((o) => o.id !== item.id && o.status === 'SCHEDULED')
                                    .map((o) => (
                                      <option key={o.id} value={o.id}>
                                        #{o.number} · {formatTime(o.startsAt!, locale)} · {o.event}
                                      </option>
                                    ))}
                                </select>
                                <Button type="submit" size="sm" variant="outline">
                                  {ts('swap')}
                                </Button>
                              </form>
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
      {allItems.length === 0 && <p className="text-muted-foreground">{ts('empty')}</p>}
    </>
  );
}
