import { formatDate, utcToAmsterdamLocal } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { ScheduleItem } from '@/server/services/schedule-service';
import { MatchLine } from './match-line';

type Item = ScheduleItem & { tournament: { name: string; slug: string } };

/** Matches grouped per day (those without a time and court last), each with its tournament. */
export async function MatchesByDay({ items, locale }: { items: Item[]; locale: AppLocale }) {
  const t = await getTranslations('Matches');
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.startsAt ? utcToAmsterdamLocal(item.startsAt).slice(0, 10) : '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([day, dayItems]) => (
        <section key={day || 'unplanned'} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase">
            {day ? formatDate(dayItems[0]!.startsAt!, locale) : t('unplannedTitle')}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {dayItems.map((m) => (
              <MatchLine key={m.id} item={m} locale={locale}>
                <Link
                  href={`/tournaments/${m.tournament.slug}/schedule`}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  {m.tournament.name}
                </Link>
              </MatchLine>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
