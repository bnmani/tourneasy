import { CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import { Fragment } from 'react';
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
  quickPlaceAndStartAction,
  quickSwapTeamsAction,
  quickUnstartMatchAction,
  removeStageAction,
  quickWalkoverAction,
  resultAction,
  retireAction,
  swissRoundAction,
  walkoverAction,
} from '@/server/actions/match-actions';
import { requirePortal } from '@/server/auth/web';
import { CheckInList } from '@/components/desk/check-in-list';
import { WalkoverOrRetirement } from '@/components/desk/walkover-or-retirement';
import {
  CheckInToggle,
  QuickButton,
  QuickPlaceAction,
  SwapTeamsForm,
} from '@/components/desk/quick-buttons';
import { AutoRefresh } from '@/components/matches/auto-refresh';
import { amsterdamDay, checkInList } from '@/server/services/checkin-service';
import type { Actor } from '@/server/services/session-service';
import { formatDate, formatEuro, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { isAppError } from '@/server/lib/errors';
import { drawOverview } from '@/server/services/draw-service';
import { stageStatus } from '@/server/services/results-service';
import { deskCourts, deskMatches } from '@/server/services/schedule-service';

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
  const td = await getTranslations('Admin.desk');
  const courts = await deskCourts(actor, id);
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
      {stages.some((s) => s.canRemoveKnockout || s.canRemoveSwissRound) && (
        // A stage made before a result was corrected can go again while unplayed (D99).
        <section className="space-y-2 rounded-lg border p-4 text-sm">
          {stages
            .filter((s) => s.canRemoveKnockout || s.canRemoveSwissRound)
            .map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {td('stageRemovable', { event: s.label })}
                </span>
                <QuickButton
                  size="sm"
                  variant="outline"
                  action={removeStageAction.bind(
                    null,
                    s.id,
                    s.canRemoveKnockout ? 'knockout' : 'swiss',
                  )}
                  confirm={td(
                    s.canRemoveKnockout ? 'removeKnockoutConfirm' : 'removeRoundConfirm',
                    {
                      event: s.label,
                    },
                  )}
                >
                  {td(s.canRemoveKnockout ? 'removeKnockout' : 'removeRound')}
                </QuickButton>
              </div>
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
        {/* Courts at a glance, by number: orange when in use anywhere at the venue, green when free. */}
        <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          {courts.map((c) => {
            const busy = desk.busyCourts.includes(c.number);
            return (
              <span
                key={c.id}
                role="img"
                aria-label={td(busy ? 'courtBusy' : 'courtFree', { number: c.number })}
                title={td(busy ? 'courtBusy' : 'courtFree', { number: c.number })}
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                  busy
                    ? 'border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300'
                    : 'border-green-600 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
                )}
              >
                {c.number}
              </span>
            );
          })}
        </span>
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
                    <div className="space-y-3">
                      <PresenceSummary
                        present={item.checkIn.flat().filter((p) => p.checkedIn).length}
                        total={item.checkIn.flat().length}
                        labels={{
                          all: td('allPresent'),
                          some: td('presentOf', {
                            present: item.checkIn.flat().filter((p) => p.checkedIn).length,
                            total: item.checkIn.flat().length,
                          }),
                        }}
                      />
                      <form
                        id={`scores-${item.id}`}
                        action={resultAction.bind(null, locale, id, item.id, view)}
                        className="space-y-2"
                      >
                        <input type="hidden" name="version" value={item.version} />
                        {/* One row per side: the player cards, then that side's game scores. */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex-1" />
                          {games.map((g) => (
                            <span key={g} className="w-12 text-center whitespace-nowrap">
                              {td('game', { number: g })}
                            </span>
                          ))}
                        </div>
                        {(['A', 'B'] as const).map((side, s) => (
                          <div key={side} className="flex items-center gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              {(item.checkIn[s] ?? []).map((p, i) => {
                                const busy = item.busy?.players.find((b) => b.id === p.id);
                                return (
                                  <Fragment key={p.id}>
                                    {i > 0 && <span className="text-muted-foreground">/</span>}
                                    <div className="min-w-0 flex-1">
                                      <CheckInToggle
                                        name={p.name}
                                        checkedIn={p.checkedIn}
                                        busy={
                                          busy
                                            ? busy.court
                                              ? td('playerOnCourt', { court: busy.court })
                                              : td('playerPlaying')
                                            : null
                                        }
                                        toggle={quickCheckInAction.bind(null, p.id, !p.checkedIn)}
                                        labels={{
                                          checkedIn: td('checkedIn'),
                                          tapToCheckIn: td('tapToCheckIn'),
                                        }}
                                      />
                                    </div>
                                  </Fragment>
                                );
                              })}
                            </div>
                            {games.map((g) => {
                              const typed =
                                refill && enteredId === item.id ? refill[g - 1] : undefined;
                              const set = typed
                                ? { scoreA: typed[0], scoreB: typed[1] }
                                : item.sets[g - 1];
                              return (
                                <input
                                  key={g}
                                  name={`g${g}${side.toLowerCase()}`}
                                  inputMode="numeric"
                                  aria-label={`${side === 'A' ? item.a : item.b} · ${td(
                                    side === 'A' ? 'scoreA' : 'scoreB',
                                    { number: g },
                                  )}`}
                                  defaultValue={side === 'A' ? set?.scoreA : set?.scoreB}
                                  className={cn(scoreInput, 'w-12 shrink-0')}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </form>
                      {item.busy?.courtMatch && item.court && (
                        <p className="text-xs font-medium text-amber-700">
                          {td('courtInUse', {
                            court: item.court.number,
                            match: item.busy.courtMatch,
                          })}
                        </p>
                      )}
                      {/* Court (D128) on the left, Save on the right, on one line. Save submits the score grid above. */}
                      <div className="flex items-end justify-between gap-2">
                        {item.status === 'SCHEDULED' ? (
                          <QuickPlaceAction
                            courts={courts.map((c) => ({
                              id: c.id,
                              label: td('courtNumber', { number: c.number }),
                            }))}
                            defaultCourtId={item.court?.id}
                            action={quickPlaceAndStartAction.bind(null, item.id)}
                            label={td('onCourt')}
                            labels={{ court: td('courtLabel') }}
                          />
                        ) : item.status === 'IN_PROGRESS' && item.sets.length === 0 ? (
                          // On court by mistake: back to waiting while no score is in (D99).
                          <QuickButton
                            size="sm"
                            variant="ghost"
                            action={quickUnstartMatchAction.bind(null, item.id)}
                          >
                            {td('backToWaiting')}
                          </QuickButton>
                        ) : (
                          <span />
                        )}
                        <Button type="submit" size="sm" form={`scores-${item.id}`}>
                          {done ? td('correct') : td('save')}
                        </Button>
                      </div>
                      {item.swap && (
                        <SwapTeamsForm
                          mine={item.swap.mine}
                          theirs={item.swap.theirs}
                          action={quickSwapTeamsAction.bind(null, item.id, item.swap.otherId)}
                          labels={{
                            title: td('swapTeamsTitle'),
                            mine: td('swapMine'),
                            with: td('swapWith', { number: item.swap.otherNumber }),
                            button: td('swapButton'),
                          }}
                        />
                      )}
                    </div>

                    {!done && (
                      <WalkoverOrRetirement
                        names={{ A: item.a, B: item.b }}
                        scoreFormId={`scores-${item.id}`}
                        walkover={walkoverAction.bind(null, locale, id, item.id, view)}
                        retire={retireAction.bind(null, locale, id, item.id, view)}
                      />
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{td('checkInIntro')}</p>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/v1/admin/tournaments/${tournamentId}/checkin.pdf?day=${list.day}&lang=${locale}`}
            download
          >
            {td('checkInPrint')}
          </a>
        </Button>
      </div>
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
          busy: p.busy
            ? p.busy.court
              ? td('playerOnCourt', { court: p.busy.court })
              : td('playerPlaying')
            : null,
          unpaid: p.unpaidCents > 0 ? formatEuro(p.unpaidCents, locale) : null,
          deskPaid: p.deskPaid,
        }))}
      />
    </div>
  );
}

function PresenceSummary({
  present,
  total,
  labels,
}: {
  present: number;
  total: number;
  labels: { all: string; some: string };
}) {
  const all = total > 0 && present === total;
  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        all ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground',
      )}
    >
      {all ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : null}
      {all ? labels.all : labels.some}
    </p>
  );
}
