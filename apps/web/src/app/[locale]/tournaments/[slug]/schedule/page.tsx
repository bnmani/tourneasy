import { formatDate, formatTime, utcToAmsterdamLocal } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { ExportMenu } from '@/components/export-menu';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AutoRefresh } from '@/components/matches/auto-refresh';
import { LiveMatches } from '@/components/matches/live-matches';
import { MatchLine } from '@/components/matches/match-line';
import { PageHero } from '@/components/public/ui';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { isAppError } from '@/server/lib/errors';
import { getPublicTournament } from '@/server/services/public-service';
import { publicSchedule } from '@/server/services/schedule-service';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const t = await getTranslations({ locale, namespace: 'Matches' });
  const tournament = await getPublicTournament(slug).catch(() => null);
  return pageMetadata({
    locale,
    path: `/tournaments/${slug}/schedule`,
    title: t('scheduleTitle', { tournament: tournament?.name ?? '' }),
  });
}

/** Public: the published schedule with results, refreshed while the tournament is on (D56). */
export default async function TournamentSchedulePage({ params }: Props) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const tournament = await getPublicTournament(slug).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const schedule = await publicSchedule(slug, locale);
  const t = await getTranslations('Matches');
  const days = [
    ...new Set(schedule.items.map((i) => utcToAmsterdamLocal(i.startsAt!).slice(0, 10))),
  ];

  return (
    <>
      <PageHero title={t('scheduleTitle', { tournament: tournament.name })}>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={`/tournaments/${slug}`}
            className="text-sm underline-offset-4 hover:underline"
          >
            ← {t('backToTournament')}
          </Link>
          {schedule.published && (
            <ExportMenu
              label={t('export')}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              items={[
                {
                  kind: 'pdf',
                  label: t('exportPdf'),
                  href: `/api/v1/tournaments/${slug}/schedule.pdf?lang=${locale}`,
                },
                {
                  kind: 'xlsx',
                  label: t('exportXlsx'),
                  href: `/api/v1/tournaments/${slug}/schedule.xlsx?lang=${locale}`,
                },
              ]}
            />
          )}
        </div>
      </PageHero>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-10">
        <AutoRefresh seconds={60} />
        <LiveMatches locale={locale} slug={slug} />
        {!schedule.published ? (
          <p className="text-muted-foreground">{t('notPublished')}</p>
        ) : (
          days.map((day) => {
            const items = schedule.items.filter(
              (i) => utcToAmsterdamLocal(i.startsAt!).slice(0, 10) === day,
            );
            return (
              <section key={day} className="space-y-3">
                <h2 className="font-heading text-xl font-semibold">
                  {formatDate(items[0]!.startsAt!, locale)}
                </h2>
                {[...new Set(items.map((i) => i.startsAt!.getTime()))].map((time) => (
                  <div key={time} className="grid gap-2 sm:grid-cols-[4rem_1fr]">
                    <p className="pt-3 font-semibold tabular-nums">
                      {formatTime(new Date(time), locale)}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {items
                        .filter((i) => i.startsAt!.getTime() === time)
                        .map((item) => (
                          <MatchLine key={item.id} item={item} locale={locale} showTime={false} />
                        ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
