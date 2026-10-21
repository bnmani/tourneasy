import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import type { EventDraw } from '@/server/services/draw-service';

type Entry = EventDraw['entries'][number];
type Match = EventDraw['matches'][number];

function entryLabel(entry: Entry | undefined) {
  if (!entry) return null;
  if (!entry.registration)
    return { bye: true as const, names: [] as string[], clubs: [] as string[] };
  const players = entry.registration.participants.map((p) => p.player);
  return {
    bye: false as const,
    names: players.map((p) =>
      [p.firstName, p.lastNamePrefix, p.lastName].filter(Boolean).join(' '),
    ),
    clubs: [
      ...new Set(players.map((p) => p.club?.shortName ?? p.club?.name).filter(Boolean)),
    ] as string[],
  };
}

async function Side({
  entry,
  winner,
  seed,
}: {
  entry: Entry | undefined;
  winner: boolean;
  seed: number | null;
}) {
  const t = await getTranslations('Draws');
  const label = entryLabel(entry);
  return (
    <div
      className={cn(
        'flex min-h-9 items-center gap-2 px-2.5 py-1.5 text-sm',
        winner && 'font-semibold',
      )}
    >
      {seed ? (
        <span className="w-6 shrink-0 text-xs text-muted-foreground">[{seed}]</span>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <span className="min-w-0">
        {!label ? (
          <span className="text-muted-foreground">—</span>
        ) : label.bye ? (
          <span className="text-muted-foreground italic">{t('bye')}</span>
        ) : (
          <>
            {label.names.map((n) => (
              <span key={n} className="block truncate">
                {n}
              </span>
            ))}
            {label.clubs.length > 0 && (
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {label.clubs.join(' / ')}
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

async function MatchCard({ match, entries }: { match: Match; entries: Map<string, Entry> }) {
  const a = match.entryAId ? entries.get(match.entryAId) : undefined;
  const b = match.entryBId ? entries.get(match.entryBId) : undefined;
  return (
    <div className="w-60 divide-y rounded-md border bg-card shadow-xs">
      <Side
        entry={a}
        seed={a?.seed ?? null}
        winner={!!match.winnerEntryId && match.winnerEntryId === a?.id}
      />
      <Side
        entry={b}
        seed={b?.seed ?? null}
        winner={!!match.winnerEntryId && match.winnerEntryId === b?.id}
      />
    </div>
  );
}

async function Bracket({
  matches,
  entries,
  bracket,
}: {
  matches: Match[];
  entries: Map<string, Entry>;
  bracket: 'W' | 'L';
}) {
  const t = await getTranslations('Draws');
  const own = matches.filter((m) => m.bracket === bracket);
  const rounds = [...new Set(own.map((m) => m.round))].sort((x, y) => x - y);
  const last = rounds[rounds.length - 1];
  const name = (round: number) => {
    if (bracket === 'L') return t('losersRound', { round });
    const left = last! - round;
    return left === 0
      ? t('final')
      : left === 1
        ? t('semiFinal')
        : left === 2
          ? t('quarterFinal')
          : t('round', { round });
  };
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-6">
        {rounds.map((round) => (
          <div key={round} className="flex shrink-0 flex-col">
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {name(round)}
            </h4>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {own
                .filter((m) => m.round === round)
                .map((m) => (
                  <MatchCard key={m.id} match={m} entries={entries} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function RoundList({ draw, entries }: { draw: EventDraw; entries: Map<string, Entry> }) {
  const t = await getTranslations('Draws');
  const rounds = [...new Set(draw.matches.map((m) => m.round))].sort((x, y) => x - y);
  return (
    <div className="space-y-4">
      {rounds.map((round) => (
        <div key={round}>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('round', { round })}
          </h4>
          <div className="flex flex-wrap gap-3">
            {draw.matches
              .filter((m) => m.round === round)
              .map((m) => (
                <MatchCard key={m.id} match={m} entries={entries} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Renders the draws of one event: brackets, groups with their matches, or rounds of pairings. */
export async function DrawView({ draws }: { draws: EventDraw[] }) {
  const t = await getTranslations('Draws');
  if (draws.length === 0) return null;
  const type = draws[0]!.type;
  return (
    <div className="space-y-8">
      {draws.map((draw) => {
        const entries = new Map(draw.entries.map((e) => [e.id, e]));
        if (draw.type === 'KNOCKOUT' || draw.type === 'DOUBLE_KNOCKOUT') {
          const final = draw.matches.find((m) => m.bracket === 'F');
          return (
            <div key={draw.id} className="space-y-6">
              {draw.type === 'DOUBLE_KNOCKOUT' && (
                <h3 className="font-semibold">{t('winnersBracket')}</h3>
              )}
              <Bracket matches={draw.matches} entries={entries} bracket="W" />
              {draw.type === 'DOUBLE_KNOCKOUT' && (
                <>
                  <h3 className="font-semibold">{t('losersBracket')}</h3>
                  <Bracket matches={draw.matches} entries={entries} bracket="L" />
                  {final && (
                    <div>
                      <h3 className="mb-2 font-semibold">{t('grandFinal')}</h3>
                      <MatchCard match={final} entries={entries} />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        }
        return (
          <section key={draw.id} className="space-y-4 rounded-lg border p-4">
            <h3 className="font-heading text-lg font-semibold">
              {draw.name
                ? t('group', { name: draw.name })
                : type === 'SWISS'
                  ? t('swiss')
                  : type === 'HYBRID_ROUND_ROBIN_KNOCKOUT'
                    ? t('hybrid')
                    : t('roundRobin')}
            </h3>
            {draw.stage === 'GROUP' && draw.name && (
              <ol className="list-inside list-decimal space-y-1 text-sm">
                {draw.entries
                  .filter((e) => e.registration)
                  .map((e) => {
                    const l = entryLabel(e)!;
                    return (
                      <li key={e.id}>
                        {e.seed ? <span className="text-muted-foreground">[{e.seed}] </span> : null}
                        {l.names.join(' / ')}
                        {l.clubs.length > 0 && (
                          <span className="text-muted-foreground"> · {l.clubs.join(' / ')}</span>
                        )}
                      </li>
                    );
                  })}
              </ol>
            )}
            <RoundList draw={draw} entries={entries} />
          </section>
        );
      })}
      {type === 'GROUPS_KNOCKOUT' && (
        <p className="text-sm text-muted-foreground">{t('knockoutFollowsGroups')}</p>
      )}
      {type === 'HYBRID_ROUND_ROBIN_KNOCKOUT' && (
        <p className="text-sm text-muted-foreground">{t('knockoutFollowsRanking')}</p>
      )}
      {type === 'SWISS' && <p className="text-sm text-muted-foreground">{t('swissNextRounds')}</p>}
    </div>
  );
}
