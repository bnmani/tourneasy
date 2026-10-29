import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DrawView } from '@/components/draws/draw-view';
import { PageHero } from '@/components/public/ui';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { isAppError } from '@/server/lib/errors';
import { publicDraws } from '@/server/services/draw-service';
import { eventPodium } from '@/server/services/results-service';
import { AutoRefresh } from '@/components/matches/auto-refresh';
import { getPublicTournament } from '@/server/services/public-service';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const t = await getTranslations({ locale, namespace: 'Draws' });
  const tournament = await getPublicTournament(slug).catch(() => null);
  return pageMetadata({
    locale,
    path: `/tournaments/${slug}/draws`,
    title: t('pageTitle', { tournament: tournament?.name ?? '' }),
    description: t('pageDescription', { tournament: tournament?.name ?? '' }),
  });
}

/** Public: the published draws of a tournament, one event at a time (D55). */
export default async function TournamentDrawsPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const tournament = await getPublicTournament(slug).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const events = await publicDraws(slug);
  const t = await getTranslations('Draws');
  const selected = firstParam((await searchParams).event);
  const current = events.find((e) => e.event.id === selected) ?? events[0];

  return (
    <>
      <PageHero title={t('pageTitle', { tournament: tournament.name })}>
        <Link href={`/tournaments/${slug}`} className="text-sm underline-offset-4 hover:underline">
          ← {t('backToTournament')}
        </Link>
      </PageHero>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        {events.length === 0 ? (
          <p className="text-muted-foreground">{t('none')}</p>
        ) : (
          <>
            <nav aria-label={t('events')} className="flex gap-2 overflow-x-auto pb-1">
              {events.map(({ event }) => (
                <Link
                  key={event.id}
                  href={`/tournaments/${slug}/draws?event=${event.id}`}
                  aria-current={event.id === current?.event.id ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium',
                    event.id === current?.event.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {eventLabel(
                    {
                      discipline: event.discipline,
                      name: event.name as never,
                      ageCategory: event.ageCategory as never,
                      levelClass: event.levelClass,
                    },
                    locale,
                  )}
                </Link>
              ))}
            </nav>
            {current && <Podium eventId={current.event.id} />}
            {current && (
              <h2 className="sr-only">
                {eventLabel(
                  {
                    discipline: current.event.discipline,
                    name: current.event.name as never,
                    ageCategory: current.event.ageCategory as never,
                    levelClass: current.event.levelClass,
                  },
                  locale,
                )}
              </h2>
            )}
            {current && <DrawView draws={current.draws} publicView />}
            <AutoRefresh seconds={60} />
          </>
        )}
      </div>
    </>
  );
}

async function Podium({ eventId }: { eventId: string }) {
  const podium = await eventPodium(eventId);
  if (!podium?.first) return null;
  const t = await getTranslations('Draws');
  const places = [
    { label: t('first'), names: [podium.first] },
    { label: t('second'), names: podium.second ? [podium.second] : [] },
    { label: t('third'), names: podium.third },
  ].filter((p) => p.names.length > 0);
  return (
    <section aria-label={t('podium')} className="rounded-lg border border-brand/40 bg-brand/10 p-4">
      <h2 className="mb-2 font-heading text-lg font-semibold">{t('podium')}</h2>
      <ol className="space-y-1 text-sm">
        {places.map((p) => (
          <li key={p.label}>
            <span className="font-semibold">{p.label}:</span> {p.names.join(' · ')}
          </li>
        ))}
      </ol>
    </section>
  );
}
