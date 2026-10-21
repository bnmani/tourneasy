import { pickLocalized } from '@tourneasy/shared/i18n';
import { Globe, MapPin, Navigation, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { TournamentCard } from '@/components/public/tournament-card';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { isAppError } from '@/server/lib/errors';
import { getPublicVenue } from '@/server/services/public-service';

type Props = { params: Promise<{ locale: string; slug: string }> };

const load = cache(async (slug: string) => {
  try {
    return await getPublicVenue(slug);
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
    path: `/venues/${slug}`,
    title: data.venue.name,
    description: tm('venue', { name: data.venue.name, city: data.venue.city }),
  });
}

export default async function VenuePage({ params }: Props) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { venue: v, tournaments, clubs } = data;
  const t = await getTranslations('Venues');
  const tp = await getTranslations('Public');
  const tprov = await getTranslations('Provinces');
  const address = `${v.street} ${v.houseNumber}, ${v.postcode} ${v.city}`;
  const route = `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${v.name}, ${address}`)}`;
  const texts = [
    { title: t('facilities'), text: pickLocalized(v.facilities, locale) },
    { title: t('parking'), text: pickLocalized(v.parkingInfo, locale) },
    { title: t('transport'), text: pickLocalized(v.publicTransportInfo, locale) },
  ].filter((x) => x.text);

  return (
    <>
      <PageHero
        eyebrow={tprov(v.province)}
        title={v.name}
        intro={`${address} · ${tp('courts', { count: v.numberOfCourts })}`}
      >
        <Button
          asChild
          variant="outline"
          className="border-current bg-transparent text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground"
        >
          <a href={route} target="_blank" rel="noopener noreferrer">
            <Navigation aria-hidden="true" />
            {tp('route')}
          </a>
        </Button>
      </PageHero>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:py-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="text-2xl font-semibold">
              {t('upcoming')}
            </h2>
            {tournaments.length === 0 ? (
              <p className="mt-3 text-muted-foreground">{t('noUpcoming')}</p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {tournaments.map((tournament) => (
                  <li key={tournament.slug}>
                    <TournamentCard tournament={tournament} locale={locale} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {texts.map((x) => (
            <section key={x.title}>
              <h2 className="text-xl font-semibold">{x.title}</h2>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{x.text}</p>
            </section>
          ))}
        </div>
        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-5 text-sm">
            <h2 className="font-heading text-lg font-semibold">{t('address')}</h2>
            <address className="mt-2 flex gap-1.5 text-muted-foreground not-italic">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {v.street} {v.houseNumber}
                <br />
                {v.postcode} {v.city}
              </span>
            </address>
            {v.phone && (
              <a
                href={`tel:${v.phone.replace(/\s/g, '')}`}
                className="mt-2 flex items-center gap-1.5 text-accent-text underline-offset-4 hover:underline"
              >
                <Phone aria-hidden="true" className="size-4" />
                {v.phone}
              </a>
            )}
            {v.website && (
              <a
                href={v.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1.5 text-accent-text underline-offset-4 hover:underline"
              >
                <Globe aria-hidden="true" className="size-4" />
                {tp('website')}
              </a>
            )}
          </section>
          {clubs.length > 0 && (
            <section className="rounded-lg border bg-card p-5 text-sm">
              <h2 className="font-heading text-lg font-semibold">{t('clubs')}</h2>
              <ul className="mt-2 space-y-1">
                {clubs.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/clubs/${c.slug}`}
                      className="text-accent-text underline-offset-4 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
