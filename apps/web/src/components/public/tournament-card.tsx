import { formatDayRange, formatFeeRange, type PublicTournamentSummary } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Chip, PhaseBadge } from './ui';

/** Calendar-style day block: "13 MRT". */
function DateBlock({ day, locale }: { day: string; locale: AppLocale }) {
  const date = new Date(`${day}T00:00:00Z`);
  const month = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-NL' : 'en-GB', {
    month: 'short',
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '');
  return (
    <div className="w-14 shrink-0 rounded-md bg-primary py-1.5 text-center leading-tight text-primary-foreground">
      <span className="block font-heading text-2xl font-bold">{date.getUTCDate()}</span>
      <span className="text-[0.7rem] font-semibold tracking-widest uppercase">{month}</span>
    </div>
  );
}

export async function TournamentCard({
  tournament: t,
  locale,
  heading: Heading = 'h3',
}: {
  tournament: PublicTournamentSummary;
  locale: AppLocale;
  /** The card title's level: h2 when the list sits right under the page title. */
  heading?: 'h2' | 'h3';
}) {
  const tt = await getTranslations('Tournaments');
  const fee = formatFeeRange(t.feeFromCents, t.feeToCents, locale);
  return (
    <article className="group relative flex h-full flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="flex items-start gap-4">
        <DateBlock day={t.startsOn} locale={locale} />
        <div className="min-w-0 flex-1">
          <Heading className="font-heading text-lg leading-snug font-semibold">
            <Link
              href={`/tournaments/${t.slug}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {t.name}
            </Link>
          </Heading>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDayRange(t.startsOn, t.endsOn, locale)}
          </p>
          {t.venue && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">
                {t.venue.name}, {t.venue.city}
              </span>
            </p>
          )}
        </div>
        {t.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own endpoint
          <img
            src={t.logoUrl}
            alt=""
            loading="lazy"
            className="h-10 w-auto max-w-24 shrink-0 object-contain"
          />
        )}
      </div>
      {t.disciplines.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.disciplines.map((d) => (
            <Chip key={d}>{d}</Chip>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
        <PhaseBadge phase={t.phase} />
        <span className="text-muted-foreground">
          {fee ?? tt('events', { count: t.eventCount })}
        </span>
      </div>
    </article>
  );
}
