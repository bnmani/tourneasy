import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  quickConfirmUmpireResultAction,
  quickCorrectUmpireScoreAction,
  quickResolveAlertAction,
} from '@/server/actions/match-actions';
import type { deskAlerts, umpireDeskReview } from '@/server/services/umpire-scoring-service';
import { formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { QuickButton, ScoreForm } from './quick-buttons';

const scoreInput =
  'h-10 w-12 rounded-md border border-input bg-background px-1 text-center text-base tabular-nums sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const scoreText = (games: [number, number][]) => games.map(([a, b]) => `${a}–${b}`).join(', ');

type Review = Awaited<ReturnType<typeof umpireDeskReview>>;

/** A match the umpire sent to the desk: their entry, the change log, correct and confirm. */
export async function UmpireReview({
  matchId,
  names,
  bestOf,
  review,
  locale,
}: {
  matchId: string;
  names: { A: string; B: string };
  bestOf: number;
  review: Review;
  locale: AppLocale;
}) {
  const t = await getTranslations('Admin.desk');
  const games = Array.from({ length: bestOf }, (_, i) => i + 1);
  const formId = `correct-${matchId}`;
  const row = (side: 'A' | 'B', list: [number, number][]) => (
    <div className="flex items-center gap-2" key={side}>
      <span className={cn('min-w-0 flex-1 truncate', side === 'A' && 'font-semibold')}>
        {names[side]}
      </span>
      {games.map((g) => (
        <span
          key={g}
          className="w-12 rounded-md border px-1 py-1.5 text-center text-sm tabular-nums"
        >
          {list[g - 1]?.[side === 'A' ? 0 : 1] ?? ''}
        </span>
      ))}
    </div>
  );
  const header = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex-1">{t('umpire.player')}</span>
      {games.map((g) => (
        <span key={g} className="w-12 text-center whitespace-nowrap">
          {t('game', { number: g })}
        </span>
      ))}
    </div>
  );
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="inline-flex rounded-full bg-foreground px-2.5 py-0.5 text-xs font-bold text-background">
        {t('umpire.waitingForDesk')}
      </p>
      <section className="space-y-1.5" aria-label={t('umpire.entryHeading')}>
        <h3 className="text-xs font-semibold text-muted-foreground">
          {t('umpire.entryHeading')}
          {review.umpire.name ? ` · ${t('umpire.scoredBy', { name: review.umpire.name })}` : ''}
        </h3>
        {header}
        {row('A', review.umpire.games)}
        {row('B', review.umpire.games)}
      </section>
      {review.corrected && (
        <section className="space-y-1.5 rounded-md border-2 p-2" aria-label={t('umpire.deskScore')}>
          <h3 className="text-xs font-semibold text-muted-foreground">
            {t('umpire.deskScore')} · {t('umpire.correctedNote')}
          </h3>
          {row('A', review.games)}
          {row('B', review.games)}
        </section>
      )}
      <section className="space-y-1 text-sm" aria-label={t('umpire.changeLog')}>
        <h3 className="text-xs font-semibold text-muted-foreground">{t('umpire.changeLog')}</h3>
        {review.changeLog.map((entry, i) => {
          const time = formatTime(entry.at, locale);
          return (
            <p key={i}>
              {entry.kind === 'sent'
                ? t('umpire.sentFinal', { time, name: entry.by })
                : entry.kind === 'correct'
                  ? t('umpire.logCorrect', {
                      time,
                      name: entry.by,
                      before: scoreText(entry.before ?? []),
                      after: scoreText(entry.after ?? []),
                      reason: entry.reason ?? '',
                    })
                  : t('umpire.logConfirmed', { time, name: entry.by })}
            </p>
          );
        })}
        {!review.corrected && <p className="text-muted-foreground">{t('umpire.noChanges')}</p>}
      </section>
      <details className="rounded-md border p-2">
        <summary className="cursor-pointer text-sm font-medium">{t('umpire.correctScore')}</summary>
        <ScoreForm id={formId} save={quickCorrectUmpireScoreAction.bind(null, matchId)}>
          {header}
          {(['A', 'B'] as const).map((side) => (
            <div key={side} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{names[side]}</span>
              {games.map((g) => (
                <input
                  key={g}
                  name={`g${g}${side.toLowerCase()}`}
                  inputMode="numeric"
                  aria-label={`${names[side]} · ${t(side === 'A' ? 'scoreA' : 'scoreB', { number: g })}`}
                  defaultValue={review.games[g - 1]?.[side === 'A' ? 0 : 1]}
                  className={scoreInput}
                />
              ))}
            </div>
          ))}
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t('umpire.reason')}</span>
            <input
              name="reason"
              required
              maxLength={300}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-base sm:text-sm"
            />
            <span className="text-xs text-muted-foreground">{t('umpire.reasonHint')}</span>
          </label>
          <Button type="submit" size="sm" variant="outline">
            {t('umpire.saveCorrection')}
          </Button>
        </ScoreForm>
      </details>
      <div className="flex justify-end">
        <QuickButton
          size="sm"
          action={quickConfirmUmpireResultAction.bind(null, matchId)}
          confirm={t('umpire.confirmQuestion', { score: scoreText(review.games) })}
        >
          {t('umpire.confirmResult')}
        </QuickButton>
      </div>
    </div>
  );
}

type Alert = Awaited<ReturnType<typeof deskAlerts>>[number];

/** The badge with the open alert count; it links to the alert panel. */
export async function AlertBadge({ alerts }: { alerts: Alert[] }) {
  const t = await getTranslations('Admin.desk');
  if (alerts.length === 0) return null;
  return (
    <a
      href="#alerts"
      aria-label={t('umpire.openAlert', { court: alerts[0]!.courtNumber })}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-sm font-bold"
    >
      <span aria-hidden="true">●</span>
      {t('umpire.newAlerts', { count: alerts.length })}
    </a>
  );
}

/** One alert per timed-out take-over: the desk keeps the holder or assigns the requester. */
export async function AlertPanel({ alerts, locale }: { alerts: Alert[]; locale: AppLocale }) {
  const t = await getTranslations('Admin.desk');
  if (alerts.length === 0) return null;
  return (
    <section id="alerts" className="scroll-mt-24 space-y-3" aria-label={t('umpire.alertsHeading')}>
      {alerts.map((a) => (
        <div key={a.id} className="space-y-3 rounded-lg border-2 border-foreground p-4 text-sm">
          <p className="font-semibold">
            <span aria-hidden="true">● </span>
            {t('umpire.alertBanner', { court: a.courtNumber })}
          </p>
          <h2 className="text-lg font-semibold">{t('umpire.alertTitle')}</h2>
          <p>
            {t('umpire.alertText', {
              requester: a.requester,
              holder: a.holder,
              court: a.courtNumber,
              time: formatTime(a.requestedAt, locale),
            })}
          </p>
          {a.games.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground">
              {t('umpire.alertLive', { court: a.courtNumber, score: scoreText(a.games) })}
            </p>
          )}
          <p className="font-medium">{t('umpire.decideQuestion', { court: a.courtNumber })}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <QuickButton
              size="sm"
              variant="outline"
              action={quickResolveAlertAction.bind(null, a.id, 'KEEP_CURRENT')}
            >
              {t('umpire.keepWith', { name: a.holder })}
            </QuickButton>
            <QuickButton
              size="sm"
              action={quickResolveAlertAction.bind(null, a.id, 'ASSIGN_RESERVE')}
            >
              {t('umpire.assignTo', { name: a.requester })}
            </QuickButton>
          </div>
        </div>
      ))}
    </section>
  );
}
