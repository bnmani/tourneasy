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
  checkInAction,
  knockoutStageAction,
  resultAction,
  retireAction,
  startMatchAction,
  swissRoundAction,
  walkoverAction,
} from '@/server/actions/match-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { drawOverview } from '@/server/services/draw-service';
import { stageStatus } from '@/server/services/results-service';
import { deskMatches } from '@/server/services/schedule-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };
const VIEWS = ['now', 'next', 'open', 'done'] as const;
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
  const desk = await deskMatches(actor, id, view).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!desk) notFound();
  const events = await drawOverview(actor, id);
  const stages = await Promise.all(
    events
      .filter((e) => e.status === 'PUBLISHED')
      .map(async (e) => ({ ...e, ...(await stageStatus(e.id)) })),
  );
  const t = await getTranslations('Admin');
  const td = await getTranslations('Admin.desk');

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

      {desk.items.length === 0 ? (
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
                    <div className="grid gap-2 sm:grid-cols-2">
                      {item.checkIn.map((side, s) => (
                        <div key={s} className="space-y-1">
                          {side.map((p) => (
                            <form
                              key={p.id}
                              action={checkInAction.bind(
                                null,
                                locale,
                                id,
                                p.id,
                                !p.checkedIn,
                                view,
                                `m-${item.id}`,
                              )}
                            >
                              <button
                                type="submit"
                                className={cn(
                                  'flex min-h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-xs',
                                  p.checkedIn ? 'border-primary bg-secondary' : 'border-dashed',
                                )}
                                aria-pressed={p.checkedIn}
                              >
                                <span aria-hidden="true">{p.checkedIn ? '✓' : '○'}</span>
                                <span className="truncate">{p.name}</span>
                                <span className="ml-auto text-muted-foreground">
                                  {p.checkedIn ? td('present') : td('checkIn')}
                                </span>
                              </button>
                            </form>
                          ))}
                        </div>
                      ))}
                    </div>

                    {item.status === 'SCHEDULED' && (
                      <form action={startMatchAction.bind(null, locale, id, item.id, view)}>
                        <Button type="submit" size="sm" variant="outline">
                          {td('onCourt')}
                        </Button>
                      </form>
                    )}

                    <form
                      action={resultAction.bind(null, locale, id, item.id, view)}
                      className="space-y-2"
                    >
                      <input type="hidden" name="version" value={item.version} />
                      <div className="flex flex-wrap items-end gap-3">
                        {games.map((g) => {
                          const set = item.sets[g - 1];
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
