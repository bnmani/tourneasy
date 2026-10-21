import type { AppLocale } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { liveMatches } from '@/server/services/schedule-service';
import { AutoRefresh } from './auto-refresh';
import { MatchLine } from './match-line';

/** "Live now / next on court" (D57), refreshed every 20 seconds. Renders nothing off-days. */
export async function LiveMatches({ locale, slug }: { locale: AppLocale; slug?: string }) {
  const live = await liveMatches(locale, slug);
  if (live.length === 0) return null;
  const t = await getTranslations('Matches');
  return (
    <section aria-labelledby="live-title" className="space-y-4">
      <AutoRefresh seconds={20} />
      <h2 id="live-title" className="flex items-center gap-2 font-heading text-2xl font-semibold">
        <span className="relative flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-brand" />
        </span>
        {t('liveTitle')}
      </h2>
      {live.map(({ tournament, onCourt, next }) => (
        <div key={tournament.id} className="space-y-3">
          {!slug && (
            <h3 className="font-semibold">
              <Link
                href={`/tournaments/${tournament.slug}/schedule`}
                className="underline-offset-4 hover:underline"
              >
                {tournament.name}
              </Link>
            </h3>
          )}
          {onCourt.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t('onCourtNow')}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {onCourt.map((item) => (
                  <MatchLine key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}
          {next.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t('nextUp')}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {next.map((item) => (
                  <MatchLine key={item.id} item={item} locale={locale} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
