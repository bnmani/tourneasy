import type { AppLocale } from '@tourneasy/shared/i18n';
import { formatTime } from '@tourneasy/shared';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import type { ScheduleItem } from '@/server/services/schedule-service';

/** One match in a list: time, court, category and round, both sides and the score. */
export async function MatchLine({
  item,
  locale,
  showTime = true,
  children,
}: {
  item: ScheduleItem;
  locale: AppLocale;
  showTime?: boolean;
  children?: React.ReactNode;
}) {
  const t = await getTranslations('Matches');
  const side = (name: string | null, entryId: string | null, scores: number[]) => (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        item.winnerEntryId && item.winnerEntryId === entryId && 'font-semibold',
      )}
    >
      <span className="min-w-0 truncate">{name ?? '—'}</span>
      {scores.length > 0 && (
        <span className="flex shrink-0 gap-1.5 tabular-nums">
          {scores.map((n, i) => (
            <span key={i} className="w-5 text-right">
              {n}
            </span>
          ))}
        </span>
      )}
    </div>
  );
  return (
    <article
      id={`m-${item.id}`}
      className="scroll-mt-24 space-y-2 rounded-md border bg-card p-3 text-sm"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {showTime && item.startsAt && (
          <span className="font-semibold text-foreground">{formatTime(item.startsAt, locale)}</span>
        )}
        {item.court && <span>{t('court', { number: item.court.number })}</span>}
        <span>
          {item.event} · {item.round} · #{item.number}
        </span>
        {item.status === 'IN_PROGRESS' && (
          <span className="rounded-full bg-brand px-2 py-0.5 font-bold text-brand-foreground">
            {t('live')}
          </span>
        )}
        {item.status === 'WALKOVER' && <span>{t('walkover')}</span>}
        {item.status === 'RETIRED' && <span>{t('retired')}</span>}
        {item.changed && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-bold text-destructive">
            {t('changed')}
          </span>
        )}
      </header>
      {side(
        item.a,
        item.aEntryId,
        item.sets.map((s) => s.scoreA),
      )}
      {side(
        item.b,
        item.bEntryId,
        item.sets.map((s) => s.scoreB),
      )}
      {children}
    </article>
  );
}
