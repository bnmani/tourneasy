import { Globe, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { PlayerList } from '@/components/public/player-list';
import { PageHero } from '@/components/public/ui';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { isAppError } from '@/server/lib/errors';
import { getPublicClub } from '@/server/services/public-service';

type Props = { params: Promise<{ locale: string; slug: string }> };

const load = cache(async (slug: string) => {
  try {
    return await getPublicClub(slug);
  } catch (error) {
    if (isAppError(error) && error.code === 'notFound') return null;
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { robots: { index: false } };
  const tm = await getTranslations({ locale, namespace: 'MetadataPages' });
  return pageMetadata({
    locale,
    path: `/clubs/${slug}`,
    title: data.club.name,
    description: tm('club', { name: data.club.name, city: data.club.city ?? 'none' }),
  });
}

export default async function ClubPage({ params }: Props) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { club: c, players } = data;
  const t = await getTranslations('Clubs');
  const tp = await getTranslations('Public');
  const tprov = await getTranslations('Provinces');

  return (
    <>
      <PageHero
        eyebrow={c.shortName ?? undefined}
        title={c.name}
        intro={
          [c.city, c.province ? tprov(c.province) : null].filter(Boolean).join(' · ') || undefined
        }
      />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:py-10 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="players-title" className="min-w-0">
          <h2 id="players-title" className="text-2xl font-semibold">
            {t('playersTitle')}
          </h2>
          {players.length === 0 ? (
            <p className="mt-3 text-muted-foreground">{t('noPlayers')}</p>
          ) : (
            <div className="mt-4">
              <PlayerList players={players} locale={locale} showClub={false} />
            </div>
          )}
        </section>
        <aside className="space-y-4">
          {(c.venue || c.website) && (
            <section className="space-y-3 rounded-lg border bg-card p-5 text-sm">
              {c.venue && (
                <div>
                  <h2 className="font-heading text-lg font-semibold">{t('homeVenue')}</h2>
                  <Link
                    href={`/venues/${c.venue.slug}`}
                    className="mt-1 flex items-center gap-1.5 text-accent-text underline-offset-4 hover:underline"
                  >
                    <MapPin aria-hidden="true" className="size-4" />
                    {c.venue.name}, {c.venue.city}
                  </Link>
                </div>
              )}
              {c.website && (
                <a
                  href={c.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-accent-text underline-offset-4 hover:underline"
                >
                  <Globe aria-hidden="true" className="size-4" />
                  {tp('website')}
                </a>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
