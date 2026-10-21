import { formatDayRange, formatMonthYear, type PublicTournamentSummary } from '@tourneasy/shared';
import { CalendarPlus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHero, PhaseBadge } from '@/components/public/ui';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { calendarTournaments } from '@/server/services/public-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Calendar' });
  const tm = await getTranslations({ locale, namespace: 'MetadataPages' });
  return pageMetadata({
    locale,
    path: '/calendar',
    title: t('title'),
    description: tm('calendar'),
  });
}

export default async function CalendarPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const t = await getTranslations('Calendar');
  const tournaments = await calendarTournaments(12);

  // Group by the month a tournament starts in ("2026-11").
  const months = new Map<string, PublicTournamentSummary[]>();
  for (const tournament of tournaments) {
    const key = tournament.startsOn.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), tournament]);
  }

  return (
    <>
      <PageHero title={t('title')} intro={t('intro')} />
      <div className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:py-10">
        {months.size === 0 && (
          <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            {t('empty')}
          </p>
        )}
        {[...months.entries()].map(([month, items]) => (
          <section key={month} aria-labelledby={`month-${month}`}>
            <h2
              id={`month-${month}`}
              className="border-b pb-2 text-2xl font-semibold first-letter:uppercase"
            >
              {formatMonthYear(`${month}-01`, locale)}
            </h2>
            <ul className="divide-y">
              {items.map((item) => (
                <li
                  key={item.slug}
                  className="grid gap-x-4 gap-y-1 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center"
                >
                  <span className="text-sm font-semibold text-accent-text">
                    {formatDayRange(item.startsOn, item.endsOn, locale)}
                  </span>
                  <span className="min-w-0">
                    <Link
                      href={`/tournaments/${item.slug}`}
                      className="font-heading text-lg font-semibold underline-offset-4 hover:underline"
                    >
                      {item.name}
                    </Link>
                    {item.venue && (
                      <span className="block text-sm text-muted-foreground">
                        {item.venue.name}, {item.venue.city}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    <PhaseBadge phase={item.phase} />
                    <a
                      href={`/api/v1/tournaments/${item.slug}/calendar.ics`}
                      download
                      className="inline-flex items-center gap-1 text-sm font-medium text-accent-text underline-offset-4 hover:underline"
                    >
                      <CalendarPlus aria-hidden="true" className="size-4" />
                      {t('addToCalendar')}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
