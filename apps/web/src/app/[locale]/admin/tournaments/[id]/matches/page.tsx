import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { MatchLine } from '@/components/matches/match-line';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import {
  knockoutStageAction,
  quickCheckInAction,
  quickStartMatchAction,
  quickWalkoverAction,
  resultAction,
  retireAction,
  swissRoundAction,
  walkoverAction,
} from '@/server/actions/match-actions';
import { requirePortal } from '@/server/auth/web';
import { CheckInList } from '@/components/desk/check-in-list';
import { CheckInToggle, QuickButton } from '@/components/desk/quick-buttons';
import { AutoRefresh } from '@/components/matches/auto-refresh';
import { amsterdamDay, checkInList } from '@/server/services/checkin-service';
import type { Actor } from '@/server/services/session-service';
import { formatDate, formatEuro, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { isAppError } from '@/server/lib/errors';
import { drawOverview } from '@/server/services/draw-service';
import { stageStatus } from '@/server/services/results-service';
import { deskMatches } from '@/server/services/schedule-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };
const VIEWS = ['checkin', 'now', 'next', 'open', 'done'] as const;
type View = (typeof VIEWS)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.desk' });
  return { title: t('title'), robots: { index: false } };
}

const scoreInput =
  'h-10 w-12 rounded-md border border-input bg-background px-1 text-center text-base tabular-nums sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** The desk on the day (D57): check-in, on court, scores, walkovers, next stages. */
export default async function DeskPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const query = await searchParams;
  const requested = firstParam(query.view);
  const view: View = (VIEWS as readonly string[]).includes(requested ?? '')
    ? (requested as View)
    : 'next';
  const desk = await deskMatches(actor, id, view === 'checkin' ? 'next' : view, locale).catch(
    (e) => {
      if (isAppError(e) && e.code === 'notFound') return null;
      throw e;
    },
  );
  if (!desk) notFound();
  const events = await drawOverview(actor, id);
  const stages = await Promise.all(
    events
      .filter((e) => e.status === 'PUBLISHED')
      .map(async (e) => ({ ...e, ...(await stageStatus(e.id)) })),
  );
  const t = await getTranslations('Admin');
  const td = await getTranslations('Admin.desk');
  // After a refused score, refill what was typed for that match.
  const [enteredId, enteredGames] = (firstParam(query.entered) ?? '').split('~');
  const refill =
    firstParam(query.status) !== 'resultSaved' && enteredId
      ? (enteredGames ?? '')
          .split('.')
          .filter(Boolean)
          .map((g) => g.split('-').map(Number) as [number, number])
      : null;

  // No-show (D74): this long after the start, someone on a side isn't checked in yet. With
  // exactly one side complete, offer that side the walkover (never automatic).
  // Server component, rendered afresh on every refresh: reading the clock here is intended.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const noShow = (item: (typeof desk.items)[number]) => {
    const limit = desk.tournament.noShowMinutes;
    if (!limit || !item.startsAt || !['SCHEDULED', 'CALLED'].includes(item.status)) return null;
    if (now < item.startsAt.getTime() + limit * 60_000) return null;
    // Only on the match day: older unplayed matches don't need an alarm.
    if (amsterdamDay(item.startsAt) !== amsterdamDay(new Date(now))) return null;
    const missing = item.checkIn
      .flat()
      .filter((p) => !p.checkedIn)
      .map((p) => p.name);
    if (missing.length === 0) return null;
    const complete = item.checkIn.map((side) => side.length > 0 && side.every((p) => p.checkedIn));
    const winner = complete[0] && !complete[1] ? 'A' : complete[1] && !complete[0] ? 'B' : null;
    return {
      late: Math.floor((now - item.startsAt.getTime()) / 60_000),
      missing,
      winner: winner as 'A' | 'B' | null,
      winnerName: (winner === 'A' ? item.a : item.b) ?? '',
    };
  };

  return (
    <>
      <PageHeader
        title={td('heading', { tournament: desk.tournament.name })}
        intro={td('intro')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/admin/tournaments/${id}/schedule`}>{td('schedule')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/admin/tournaments/${id}`}>{t('back')}</Link>
            </Button>
          </>
        }
      />
      <StatusNotice
        status={firstParam(query.status)}
        params={{ game: firstParam(query.game) ?? '' }}
      />

      {stages.some((s) => s.canKnockout || s.canNextSwissRound) && (
        <section className="space-y-2 rounded-lg border border-brand/40 bg-brand/10 p-4 text-sm">
          {stages
            .filter((s) => s.canKnockout || s.canNextSwissRound)
            .map((s) => (
              <form
                key={s.id}
                action={(s.canKnockout ? knockoutStageAction : swissRoundAction).bind(
                  null,
                  locale,
                  id,
                  s.id,
                )}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {s.canKnockout
                    ? td('groupsDone', { event: s.label })
                    : td('swissRoundDone', { event: s.label })}
                </span>
                <Button type="submit" size="sm">
                  {s.canKnockout ? td('makeKnockout') : td('nextRound')}
                </Button>
              </form>
            ))}
        </section>
      )}

      <AutoRefresh seconds={10} />
      <nav aria-label={td('views')} className="flex gap-2 overflow-x-auto pb-1">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/admin/tournaments/${id}/matches?view=${v}`}
            aria-current={v === view ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium',
              v === view ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {td(`view.${v}`)}
          </Link>
        ))}
      </nav>

      {view === 'checkin' ? (
        <CheckInView actor={actor} tournamentId={id} locale={locale} day={firstParam(query.day)} />
      ) : desk.items.length === 0 ? (
        <p className="text-muted-foreground">{td('empty')}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {desk.items.map((item) => {
            const done = ['COMPLETED', 'WALKOVER', 'RETIRED'].includes(item.status);
            const games = Array.from({ length: item.bestOf }, (_, i) => i + 1);
            return (
              <MatchLine key={item.id} item={item} locale={locale}>
                {item.ready && (
                  <div className="space-y-3 border-t pt-3">
                    {noShow(item) && (
                      <div
                        role="alert"
                        className="space-y-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-2 text-sm"
                      >
                        <p className="font-medium">
                          {td('noShow', {
                            names: noShow(item)!.missing.join(', '),
                            minutes: noShow(item)!.late,
                          })}
                        </p>
                        {noShow(item)!.winner && (
                          <QuickButton
                            size="sm"
                            variant="outline"
                            action={quickWalkoverAction.bind(null, item.id, noShow(item)!.winner!)}
                            confirm={td('noShowConfirm', { name: noShow(item)!.winnerName })}
                          >
                            {td('noShowWalkover', { name: noShow(item)!.winnerName })}
                          </QuickButton>
                        )}
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {item.checkIn.map((side, s) => (
                        <div key={s} className="space-y-1">
                          {side.map((p) => (
                            <CheckInToggle
                              key={p.id}
                              name={p.name}
                              checkedIn={p.checkedIn}
                              toggle={quickCheckInAction.bind(null, p.id, !p.checkedIn)}
                              labels={{ present: td('present'), checkIn: td('checkIn') }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>

                    {item.status === 'SCHEDULED' && (
                      <QuickButton
                        size="sm"
                        variant="outline"
                        action={quickStartMatchAction.bind(null, item.id)}
                      >
                        {td('onCourt')}
                      </QuickButton>
                    )}

                    <form
                      action={resultAction.bind(null, locale, id, item.id, view)}
                      className="space-y-2"
                    >
                      <input type="hidden" name="version" value={item.version} />
                      <div className="flex flex-wrap items-end gap-3">
                        {games.map((g) => {
                          const typed = refill && enteredId === item.id ? refill[g - 1] : undefined;
                          const set = typed
                            ? { scoreA: typed[0], scoreB: typed[1] }
                            : item.sets[g - 1];
                          return (
                            <fieldset key={g} className="space-y-1">
                              <legend className="text-xs text-muted-foreground">
                                {td('game', { number: g })}
                              </legend>
                              <div className="flex items-center gap-1">
                                <input
                                  name={`g${g}a`}
                                  inputMode="numeric"
                                  aria-label={td('scoreA', { number: g })}
                                  defaultValue={set?.scoreA}
                                  className={scoreInput}
                                />
                                <span aria-hidden="true">–</span>
                                <input
                                  name={`g${g}b`}
                                  inputMode="numeric"
                                  aria-label={td('scoreB', { number: g })}
                                  defaultValue={set?.scoreB}
                                  className={scoreInput}
                                />
                              </div>
                            </fieldset>
                          );
                        })}
                        <Button type="submit" size="sm">
                          {done ? td('correct') : td('save')}
                        </Button>
                      </div>
                    </form>

                    {!done && (
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium text-primary">
                          {td('other')}
                        </summary>
                        <div className="mt-2 space-y-2">
                          <form
                            action={walkoverAction.bind(null, locale, id, item.id, view)}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <span>{td('walkoverWinner')}</span>
                            <Button
                              type="submit"
                              name="winner"
                              value="A"
                              size="sm"
                              variant="outline"
                            >
                              {item.a}
                            </Button>
                            <Button
                              type="submit"
                              name="winner"
                              value="B"
                              size="sm"
                              variant="outline"
                            >
                              {item.b}
                            </Button>
                          </form>
                          <form
                            action={retireAction.bind(null, locale, id, item.id, view)}
                            className="space-y-2"
                          >
                            <p>{td('retiredHelp')}</p>
                            <div className="flex flex-wrap items-end gap-3">
                              {games.map((g) => (
                                <div key={g} className="flex items-center gap-1">
                                  <input
                                    name={`g${g}a`}
                                    inputMode="numeric"
                                    aria-label={td('scoreA', { number: g })}
                                    className={scoreInput}
                                  />
                                  <span aria-hidden="true">–</span>
                                  <input
                                    name={`g${g}b`}
                                    inputMode="numeric"
                                    aria-label={td('scoreB', { number: g })}
                                    className={scoreInput}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{td('retiredWinner')}</span>
                              <Button
                                type="submit"
                                name="winner"
                                value="A"
                                size="sm"
                                variant="outline"
                              >
                                {item.a}
                              </Button>
                              <Button
                                type="submit"
                                name="winner"
                                value="B"
                                size="sm"
                                variant="outline"
                              >
                                {item.b}
                              </Button>
                            </div>
                          </form>
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </MatchLine>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The "Check-in" tab (D74): the day's players, one tap each, payment at the desk. */
async function CheckInView({
  actor,
  tournamentId,
  locale,
  day,
}: {
  actor: Actor;
  tournamentId: string;
  locale: AppLocale;
  day?: string;
}) {
  const list = await checkInList(actor, tournamentId, day);
  const td = await getTranslations('Admin.desk');
  const dayLabel = (d: string) => formatDate(new Date(`${d}T12:00:00Z`), locale);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{td('checkInIntro')}</p>
      {list.days.length > 1 && (
        <nav aria-label={td('checkInDay')} className="flex flex-wrap gap-2">
          {list.days.map((d) => (
            <Link
              key={d}
              href={`/admin/tournaments/${tournamentId}/matches?view=checkin&day=${d}`}
              aria-current={d === list.day ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium',
                d === list.day
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent',
              )}
            >
              {dayLabel(d)}
            </Link>
          ))}
        </nav>
      )}
      <CheckInList
        tournamentId={tournamentId}
        rows={list.players.map((p) => ({
          playerId: p.playerId,
          name: p.name,
          memberNumber: p.memberNumber,
          club: p.club,
          when: p.firstMatch
            ? `${td('firstMatch', { time: formatTime(p.firstMatch, locale) })} · ${td('matches', { count: p.matches })}`
            : null,
          present: p.present,
          unpaid: p.unpaidCents > 0 ? formatEuro(p.unpaidCents, locale) : null,
        }))}
      />
    </div>
  );
}
