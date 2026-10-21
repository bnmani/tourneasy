import { formatDayRange, formatFeeRange } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import type { Metadata } from 'next';
import { Bell, CalendarClock, CreditCard, Radio } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HeroImage } from '@/components/home/hero-image';
import { TournamentCarousel } from '@/components/home/tournament-carousel';
import { Button } from '@/components/ui/button';
import { LiveMatches } from '@/components/matches/live-matches';
import { Link } from '@/i18n/navigation';
import { pageMetadata } from '@/lib/seo';
import { getActor } from '@/server/auth/web';
import { featuredTournaments } from '@/server/services/public-service';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = (await params).locale as AppLocale;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const meta = pageMetadata({
    locale,
    path: '/',
    title: t('title'),
    description: t('description'),
  });
  // The home page title already contains the site name, so skip the "| Tourneasy" template.
  return { ...meta, title: { absolute: t('title') } };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  // The [locale] layout has already rejected unsupported locales.
  setRequestLocale(locale as AppLocale);
  const t = await getTranslations('Home');
  const actor = await getActor();
  const tph = await getTranslations('Phases');
  const featured = await featuredTournaments(6);

  // Live results and "next on court" join the home page in Phase 6.
  const features = [
    { icon: Radio, title: t('featureLiveTitle'), text: t('featureLiveText') },
    { icon: CreditCard, title: t('featurePayTitle'), text: t('featurePayText') },
    { icon: CalendarClock, title: t('featureScheduleTitle'), text: t('featureScheduleText') },
    { icon: Bell, title: t('featureFollowTitle'), text: t('featureFollowText') },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-hero text-hero-foreground">
        <HeroImage />
        {/* Keeps the text readable over the picture; on phones the player sits behind it. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,var(--hero)_0%,color-mix(in_srgb,var(--hero)_75%,transparent)_45%,transparent_75%)] max-md:bg-[color-mix(in_srgb,var(--hero)_55%,transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-32 sm:pt-24 sm:pb-36 md:min-h-[600px]">
          <div className="max-w-xl">
            <p className="text-xs font-bold tracking-[0.14em] text-hero-highlight uppercase">
              {t('heroEyebrow')}
            </p>
            <h1 className="mt-4 text-4xl leading-[1.08] font-semibold sm:text-6xl">
              {t('heroLine1')}
              <br />
              <em className="text-hero-highlight">{t('heroLine2')}</em>
              <br />
              {t('heroLine3')}
            </h1>
            <p className="mt-5 max-w-md text-lg text-hero-muted">{t('heroText')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {actor ? (
                  <Link href="/account">{t('ctaDashboard')}</Link>
                ) : (
                  <Link href="/register">{t('ctaRegister')}</Link>
                )}
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-current bg-transparent text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground"
              >
                <Link href="/#about">{t('ctaAbout')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <div className="relative z-10 mx-auto -mt-20 max-w-6xl px-4 sm:-mt-24">
          <TournamentCarousel
            items={featured.map((f) => ({
              slug: f.slug,
              name: f.name,
              dates: formatDayRange(f.startsOn, f.endsOn, locale as AppLocale, 'long'),
              place: f.venue ? `${f.venue.name}, ${f.venue.city}` : null,
              phase: f.phase,
              phaseLabel: tph(f.phase),
              disciplines: f.disciplines,
              fee: formatFeeRange(f.feeFromCents, f.feeToCents, locale as AppLocale),
            }))}
            labels={{
              region: t('carouselLabel'),
              previous: t('previous'),
              next: t('next'),
              slide: t.raw('slide') as string,
              viewAll: t('allTournaments'),
            }}
          />
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 pt-12 empty:hidden">
        <LiveMatches locale={locale as AppLocale} />
      </div>

      <section
        id="about"
        aria-labelledby="about-title"
        className="mx-auto max-w-6xl px-4 py-16 sm:py-20"
      >
        <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] md:gap-14">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent-text uppercase">
              {t('aboutEyebrow')}
            </p>
            <h2 id="about-title" className="mt-3 text-3xl font-semibold sm:text-4xl">
              {t('aboutTitle')}
            </h2>
            <p className="mt-4 text-muted-foreground">{t('aboutText')}</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-lg border bg-card p-5 text-card-foreground">
                <span className="grid size-10 place-items-center rounded-md bg-secondary text-accent-text">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
