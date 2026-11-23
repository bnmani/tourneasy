import { type KnockoutMatch, knockoutRounds } from '@tourneasy/shared';
import { useTranslations } from 'next-intl';

/**
 * How a hybrid knockout of `size` teams is drawn (shown in the event form): the first round pairs
 * the ranking by seed, then each later match is the winners of two matches above it.
 */
export function KnockoutPath({ size }: { size: number }) {
  const t = useTranslations('KnockoutPath');
  const roundName = (teams: number) =>
    teams === 2
      ? t('final')
      : teams === 4
        ? t('semiFinal')
        : teams === 8
          ? t('quarterFinal')
          : t('roundOf', { count: teams });
  const line = (m: KnockoutMatch) =>
    'seed' in m.a && 'seed' in m.b
      ? t('seedVs', { a: m.a.seed, b: m.b.seed })
      : 'winnerOf' in m.a && 'winnerOf' in m.b
        ? t('winnersVs', { a: m.a.winnerOf, b: m.b.winnerOf })
        : '';
  return (
    <details open className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t('title')}</summary>
      <p className="mt-2 text-muted-foreground">{t('topN', { count: size })}</p>
      <p className="text-muted-foreground">{t('rankingRule')}</p>
      {knockoutRounds(size).map((r) => (
        <div key={r.teams} className="mt-3">
          <h4 className="font-semibold">{roundName(r.teams)}</h4>
          <ol className="mt-1 space-y-0.5">
            {r.matches.map((m) => (
              <li key={m.number}>
                <span className="text-muted-foreground">{t('matchLabel', { n: m.number })}:</span>{' '}
                {line(m)}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="mt-3 text-muted-foreground">{t('outro')}</p>
    </details>
  );
}
