import { formatDate, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import type { ExpectedCategory, HybridDraw } from '@/server/services/expected-knockout-service';
import { KnockoutPath } from './knockout-path';

/** "14:15", or "Sat 21 Nov, 14:15" when the tournament lasts more than a day. */
function when(date: Date, locale: AppLocale, showDay: boolean) {
  return showDay
    ? `${formatDate(date, locale)} · ${formatTime(date, locale)}`
    : formatTime(date, locale);
}

/**
 * The knockout rounds that follow the group stage, as the planner expects them (D121): greyed
 * rows per category and round, labelled "expected" because the real times depend on how the
 * groups go. Shown on the public and organiser schedule.
 */
export async function ExpectedKnockoutList({
  categories,
  draws,
  locale,
  showDay = false,
}: {
  categories: ExpectedCategory[];
  draws: HybridDraw[];
  locale: AppLocale;
  showDay?: boolean;
}) {
  const t = await getTranslations('Matches');
  if (categories.length === 0 && draws.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="expected-knockout">
      <h2 id="expected-knockout" className="font-heading text-xl font-semibold">
        {t('expectedTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('expectedIntro')}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((c) => (
          <article
            key={c.eventId}
            className="min-w-0 space-y-2 rounded-md border border-dashed bg-secondary/40 p-3 text-sm"
          >
            <h3 className="font-semibold">{c.event}</h3>
            <ul className="space-y-2">
              {c.rounds.map((r) => (
                <li key={r.name} className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('expectedFrom', { time: when(r.from, locale, showDay) })}
                    </span>
                  </p>
                  <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    {r.matches.map((m, i) => (
                      <li key={i} className="break-words">
                        {m.b === null ? m.a : t('expectedVs', { a: m.a, b: m.b })}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {draws.map((d) => (
        <div key={d.eventId} className="space-y-2">
          <h3 className="font-semibold">{d.event}</h3>
          <KnockoutPath size={d.drawSize} />
        </div>
      ))}
    </section>
  );
}

/** My schedule: one line per category I'm entered in, with the expected knockout times. */
export async function ExpectedKnockoutLines({
  tournaments,
  locale,
}: {
  tournaments: { tournament: { name: string; slug: string }; categories: ExpectedCategory[] }[];
  locale: AppLocale;
}) {
  const t = await getTranslations('Matches');
  if (tournaments.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="expected-knockout-mine">
      <h3
        id="expected-knockout-mine"
        className="text-sm font-semibold text-muted-foreground uppercase"
      >
        {t('expectedMineTitle')}
      </h3>
      {tournaments.map(({ tournament, categories }) => (
        <div
          key={tournament.slug}
          className="space-y-1 rounded-md border border-dashed bg-secondary/40 p-3 text-sm"
        >
          <p className="font-medium">{tournament.name}</p>
          {categories.map((c) => (
            <p key={c.eventId} className="break-words text-muted-foreground">
              <span className="text-foreground">{c.event}</span>:{' '}
              {c.rounds
                .map((r) =>
                  t('expectedRoundFrom', { name: r.name, time: when(r.from, locale, true) }),
                )
                .join(' · ')}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">{t('expectedMineHint')}</p>
        </div>
      ))}
    </section>
  );
}
