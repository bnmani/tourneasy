import {
  formatDate,
  formatDayRange,
  formatEuro,
  formatTime,
  type PublicEvent,
  type PublicTournament,
} from '@tourneasy/shared';
import { pickLocalized, type AppLocale } from '@tourneasy/shared/i18n';
import {
  CalendarClock,
  CalendarPlus,
  GitBranch,
  Mail,
  MapPin,
  Navigation,
  Phone,
} from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import { InfoList, PageHero, PhaseBadge } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { pageLocale } from '@/lib/page';
import { pageMetadata } from '@/lib/seo';
import { getActor } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { LiveMatches } from '@/components/matches/live-matches';
import { TournamentNews } from '@/components/public/tournament-news';
import { hasPublishedDraws } from '@/server/services/draw-service';
import { getPublicTournament } from '@/server/services/public-service';

type Props = { params: Promise<{ locale: string; slug: string }> };

// Metadata and page share one database read per request.
const load = cache(async (slug: string): Promise<PublicTournament | null> => {
  try {
    return await getPublicTournament(slug);
  } catch (error) {
    if (isAppError(error) && error.code === 'notFound') return null;
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const t = await load(slug);
  if (!t) return { robots: { index: false } };
  const tm = await getTranslations({ locale, namespace: 'MetadataPages' });
  return pageMetadata({
    locale,
    path: `/tournaments/${slug}`,
    title: t.name,
    description: tm('tournament', {
      name: t.name,
      dates: formatDayRange(t.startsOn, t.endsOn, locale, 'long'),
      place: t.venue?.city ?? 'Nederland',
    }),
  });
}

function eventName(e: PublicEvent, locale: AppLocale) {
  return eventLabel(
    {
      discipline: e.discipline,
      name: e.name,
      ageCategory: e.ageCategory,
      levelClass: e.level ? { code: e.level } : null,
    },
    locale,
  );
}

function directionsUrl(t: PublicTournament) {
  const v = t.venue!;
  const query = `${v.name}, ${v.street} ${v.houseNumber}, ${v.postcode} ${v.city}`;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

/** schema.org SportsEvent so search engines can show dates and place. */
function jsonLd(t: PublicTournament, locale: AppLocale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: t.name,
    sport: 'Badminton',
    startDate: t.startsOn,
    endDate: t.endsOn,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: `${process.env.APP_URL ?? ''}/${locale}/tournaments/${t.slug}`,
    ...(t.description ? { description: pickLocalized(t.description, locale) } : {}),
    ...(t.venue
      ? {
          location: {
            '@type': 'Place',
            name: t.venue.name,
            address: {
              '@type': 'PostalAddress',
              streetAddress: `${t.venue.street} ${t.venue.houseNumber}`,
              postalCode: t.venue.postcode,
              addressLocality: t.venue.city,
              addressCountry: t.venue.country,
            },
          },
        }
      : {}),
    ...(t.feeFromCents !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: (t.feeFromCents / 100).toFixed(2),
            priceCurrency: 'EUR',
            validFrom: t.registrationOpensAt,
          },
        }
      : {}),
  };
}

export default async function TournamentPage({ params }: Props) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const t = await load(slug);
  if (!t) notFound();

  const tt = await getTranslations('Tournament');
  const signedIn = !!(await getActor());
  const tp = await getTranslations('Public');
  const tdt = await getTranslations('DrawTypes');
  const description = pickLocalized(t.description, locale);
  const dateTime = (iso: string) =>
    `${formatDate(new Date(iso), locale)}, ${formatTime(new Date(iso), locale)}`;

  const entryText = {
    registrationSoon: tt('entrySoon', { date: dateTime(t.registrationOpensAt) }),
    registrationOpen: tt('entryOpen', { date: dateTime(t.registrationClosesAt) }),
    registrationClosed: tt('entryClosed'),
    inProgress: tt('entryInProgress'),
    finished: tt('entryFinished'),
  }[t.phase];

  const formatDetail = (e: PublicEvent) => {
    if (e.drawType === 'GROUPS_KNOCKOUT' && e.groupSize && e.advancePerGroup)
      return tt('groups', { size: e.groupSize, advance: e.advancePerGroup });
    if (e.drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT' && e.matchesPerEntry && e.knockoutSize)
      return tt('hybrid', { matches: e.matchesPerEntry, size: e.knockoutSize });
    return null;
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD is data, not script; JSON.stringify output contains no raw "</".
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd(t, locale)).replace(/</g, '\\u003c'),
        }}
      />
      <PageHero
        eyebrow={<PhaseBadge phase={t.phase} />}
        title={t.name}
        intro={
          <>
            {formatDayRange(t.startsOn, t.endsOn, locale, 'long')}
            {t.venue && (
              <>
                {' · '}
                {t.venue.name}, {t.venue.city}
              </>
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
            <a href={`/api/v1/tournaments/${t.slug}/calendar.ics`} download>
              <CalendarPlus aria-hidden="true" />
              {tt('addToCalendar')}
            </a>
          </Button>
          {t.schedulePublished && (
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link href={`/tournaments/${t.slug}/schedule`}>
                <CalendarClock aria-hidden="true" />
                {tt('schedule')}
              </Link>
            </Button>
          )}
          {(await hasPublishedDraws(t.slug)) && (
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Link href={`/tournaments/${t.slug}/draws`}>
                <GitBranch aria-hidden="true" />
                {tt('draws')}
              </Link>
            </Button>
          )}
          {t.venue && (
            <Button
              asChild
              variant="outline"
              className="border-current bg-transparent text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground"
            >
              <a href={directionsUrl(t)} target="_blank" rel="noopener noreferrer">
                <Navigation aria-hidden="true" />
                {tp('route')}
              </a>
            </Button>
          )}
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 pt-8 empty:hidden">
        <LiveMatches locale={locale} slug={t.slug} />
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-8 empty:hidden">
        <TournamentNews slug={t.slug} locale={locale} />
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:py-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          {description && (
            <section aria-labelledby="about-title">
              <h2 id="about-title" className="text-2xl font-semibold">
                {tt('about')}
              </h2>
              <div className="mt-3 space-y-3 text-muted-foreground">
                {description.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="events-title">
            <h2 id="events-title" className="text-2xl font-semibold">
              {tt('events')}
            </h2>
            {t.events.length === 0 ? (
              <p className="mt-3 text-muted-foreground">{tt('noEvents')}</p>
            ) : (
              <ScrollRegion label={tt('eventsTable')} className="mt-4 rounded-lg border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/60 text-xs text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 sm:px-4">
                        {tt('event')}
                      </th>
                      <th scope="col" className="px-3 py-2.5 sm:px-4">
                        {tt('format')}
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right sm:px-4">
                        {tt('fee')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {t.events.map((e) => (
                      <tr key={e.id} className={e.isOpen ? undefined : 'text-muted-foreground'}>
                        <td className="px-3 py-3 font-medium sm:px-4">
                          {eventName(e, locale)}
                          {!e.isOpen && (
                            <span className="ml-2 text-xs font-normal">({tt('eventClosed')})</span>
                          )}
                          {e.maxEntries && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {tt('maxEntriesValue', { count: e.maxEntries })}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          {tdt(e.drawType)}
                          {formatDetail(e) && (
                            <span className="block text-xs text-muted-foreground">
                              {formatDetail(e)}
                            </span>
                          )}
                          <span className="block text-xs text-muted-foreground">
                            {tt('scoring', {
                              bestOf: e.bestOf,
                              points: e.pointsToWin,
                              cap: e.pointsCap,
                            })}
                          </span>
                          {e.knockoutScoring && (
                            <span className="block text-xs text-muted-foreground">
                              {tt(`koScoring_${e.knockoutScoring.from}`)}:{' '}
                              {tt('scoring', {
                                bestOf: e.knockoutScoring.bestOf,
                                points: e.knockoutScoring.pointsToWin,
                                cap: e.knockoutScoring.pointsCap,
                              })}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap sm:px-4">
                          {formatEuro(e.feeCents, locale)}
                          <span className="block text-xs text-muted-foreground">
                            {tt('feeNote')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section aria-labelledby="entry-title" className="rounded-lg border bg-card p-5">
            <h2 id="entry-title" className="font-heading text-lg font-semibold">
              {tt('entry')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{entryText}</p>
            {t.phase === 'registrationOpen' && (
              <Button asChild className="mt-4 w-full">
                {signedIn ? (
                  <Link href={`/tournaments/${t.slug}/enter`}>{tt('entryCta')}</Link>
                ) : (
                  <Link
                    href={`/login?next=${encodeURIComponent(`/${locale}/tournaments/${t.slug}/enter`)}`}
                  >
                    {tt('entryCtaLogin')}
                  </Link>
                )}
              </Button>
            )}
          </section>

          <section aria-labelledby="dates-title" className="rounded-lg border bg-card p-5">
            <h2 id="dates-title" className="font-heading text-lg font-semibold">
              {tt('keyInfo')}
            </h2>
            <InfoList
              items={[
                { label: tt('registrationOpens'), value: dateTime(t.registrationOpensAt) },
                { label: tt('registrationCloses'), value: dateTime(t.registrationClosesAt) },
                { label: tt('withdrawal'), value: dateTime(t.withdrawalDeadline) },
                ...(t.dayStartTime ? [{ label: tt('firstMatch'), value: t.dayStartTime }] : []),
                {
                  label: tt('maxEvents'),
                  value: tt('maxEventsValue', { count: t.maxEventsPerPlayer }),
                },
                ...(t.bundlePricesCents.length > 0
                  ? [
                      {
                        label: tt('bundle'),
                        value: (
                          <ul>
                            {t.bundlePricesCents.map((cents, n) => (
                              <li key={n} className="whitespace-nowrap">
                                {tt('bundleTier', {
                                  count: n + 1,
                                  price: formatEuro(cents, locale),
                                })}
                              </li>
                            ))}
                          </ul>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </section>

          <section aria-labelledby="venue-title" className="rounded-lg border bg-card p-5">
            <h2 id="venue-title" className="font-heading text-lg font-semibold">
              {tt('venue')}
            </h2>
            {t.venue ? (
              <address className="mt-2 text-sm not-italic">
                <Link
                  href={`/venues/${t.venue.slug}`}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {t.venue.name}
                </Link>
                <span className="mt-1 flex gap-1.5 text-muted-foreground">
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {t.venue.street} {t.venue.houseNumber}
                    <br />
                    {t.venue.postcode} {t.venue.city}
                  </span>
                </span>
                <span className="mt-1 block text-muted-foreground">
                  {tp('courts', { count: t.venue.numberOfCourts })}
                </span>
              </address>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{tt('venueTbd')}</p>
            )}
          </section>

          {(t.contact.name || t.contact.email || t.contact.phone) && (
            <section aria-labelledby="contact-title" className="rounded-lg border bg-card p-5">
              <h2 id="contact-title" className="font-heading text-lg font-semibold">
                {tt('contact')}
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {t.contact.name && <li className="font-medium">{t.contact.name}</li>}
                {t.contact.email && (
                  <li>
                    <a
                      href={`mailto:${t.contact.email}`}
                      className="inline-flex items-center gap-1.5 text-accent-text underline-offset-4 hover:underline"
                    >
                      <Mail aria-hidden="true" className="size-4" />
                      {t.contact.email}
                    </a>
                  </li>
                )}
                {t.contact.phone && (
                  <li>
                    <a
                      href={`tel:${t.contact.phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-accent-text underline-offset-4 hover:underline"
                    >
                      <Phone aria-hidden="true" className="size-4" />
                      {t.contact.phone}
                    </a>
                  </li>
                )}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
