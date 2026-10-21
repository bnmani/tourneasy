import type { AppLocale } from '@tourneasy/shared/i18n';
import { formatDate } from '@tourneasy/shared';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { playerHistory } from '@/server/services/results-service';

type Row = Awaited<ReturnType<typeof playerHistory>>[number];

/** Played matches: won/lost, opponent, score, category and tournament. */
export async function HistoryList({ rows, locale }: { rows: Row[]; locale: AppLocale }) {
  const t = await getTranslations('Matches');
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('noHistory')}</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
          <span
            className={cn(
              'w-6 rounded text-center text-xs font-bold',
              r.won ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
            title={r.won ? t('wonLong') : t('lostLong')}
          >
            {r.won ? t('wonShort') : t('lostShort')}
          </span>
          <span className="min-w-0 flex-1">
            {t('versus', { name: r.opponent })}
            <span className="block text-xs text-muted-foreground">
              {eventLabel(r.event as never, locale)} ·{' '}
              <Link
                href={`/tournaments/${r.tournament.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {r.tournament.name}
              </Link>
              {r.date && <> · {formatDate(r.date, locale)}</>}
            </span>
          </span>
          <span className="tabular-nums">
            {r.walkover ? t('walkover') : r.score}
            {r.retired && ` (${t('retired')})`}
          </span>
        </li>
      ))}
    </ul>
  );
}
