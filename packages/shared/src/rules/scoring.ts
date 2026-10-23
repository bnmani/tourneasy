/**
 * Results (Phase 6c, D57): badminton game scores, standings with tie-breaks, Swiss pairing.
 *
 * A game is won by the first side to `pointsToWin` with a two-point lead; at deuce play goes
 * on until a two-point lead or the cap (21 → 30): 21-19, 24-22, 30-29 and 30-28 are valid,
 * 21-20 or 31-29 are not. A match is won with ⌈bestOf/2⌉ games.
 */

export type ScoringRules = { bestOf: number; pointsToWin: number; pointsCap: number };
export type Game = [number, number];

/** Winner of a finished game, or null when the score is not a valid final score. */
export function gameWinner([a, b]: Game, rules: ScoringRules): 'A' | 'B' | null {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (a === b || lo < 0 || !Number.isInteger(a) || !Number.isInteger(b)) return null;
  const valid =
    (hi === rules.pointsToWin && lo <= rules.pointsToWin - 2) ||
    (hi > rules.pointsToWin && hi < rules.pointsCap && lo === hi - 2) ||
    (hi === rules.pointsCap && (lo === hi - 1 || lo === hi - 2));
  if (!valid) return null;
  return a > b ? 'A' : 'B';
}

export type ScoreCheck =
  | { ok: true; winner: 'A' | 'B'; games: [number, number] }
  | { ok: false; error: 'gameScore' | 'tooFewGames' | 'tooManyGames'; game?: number };

/** Checks a complete match score (all games) and returns the winner. */
export function checkMatchScore(games: Game[], rules: ScoringRules): ScoreCheck {
  const needed = Math.ceil(rules.bestOf / 2);
  let a = 0;
  let b = 0;
  for (const [i, g] of games.entries()) {
    if (a === needed || b === needed) return { ok: false, error: 'tooManyGames', game: i + 1 };
    const w = gameWinner(g, rules);
    if (!w) return { ok: false, error: 'gameScore', game: i + 1 };
    if (w === 'A') a += 1;
    else b += 1;
  }
  if (a < needed && b < needed) return { ok: false, error: 'tooFewGames' };
  return { ok: true, winner: a > b ? 'A' : 'B', games: [a, b] };
}

export type ResultForStandings = {
  a: string;
  b: string;
  winner: string | null;
  games: Game[];
  /** Walkover: counts as a win for the winner in straight games, no points. */
  walkover?: boolean;
};

export type Standing = {
  id: string;
  played: number;
  won: number;
  lost: number;
  gamesFor: number;
  gamesAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
};

function tally(ids: string[], results: ResultForStandings[], rules: Pick<ScoringRules, 'bestOf'>) {
  const rows = new Map<string, Standing>(
    ids.map((id) => [
      id,
      {
        id,
        played: 0,
        won: 0,
        lost: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ]),
  );
  for (const r of results) {
    const ra = rows.get(r.a);
    const rb = rows.get(r.b);
    if (!ra || !rb || !r.winner) continue;
    ra.played += 1;
    rb.played += 1;
    const aWon = r.winner === r.a;
    (aWon ? ra : rb).won += 1;
    (aWon ? rb : ra).lost += 1;
    if (r.walkover) {
      const needed = Math.ceil(rules.bestOf / 2);
      (aWon ? ra : rb).gamesFor += needed;
      (aWon ? rb : ra).gamesAgainst += needed;
      continue;
    }
    for (const [pa, pb] of r.games) {
      ra.pointsFor += pa;
      ra.pointsAgainst += pb;
      rb.pointsFor += pb;
      rb.pointsAgainst += pa;
      if (pa > pb) {
        ra.gamesFor += 1;
        rb.gamesAgainst += 1;
      } else {
        rb.gamesFor += 1;
        ra.gamesAgainst += 1;
      }
    }
  }
  return rows;
}

/**
 * Standings (BWF-style): most matches won; two tied → their mutual match; three or more →
 * game difference, then point difference, then (if two remain) their mutual match.
 */
export function standings(
  ids: string[],
  results: ResultForStandings[],
  rules: Pick<ScoringRules, 'bestOf'> = { bestOf: 3 },
): Standing[] {
  const rows = tally(ids, results, rules);
  const mutual = (x: string, y: string) =>
    results.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x))?.winner ?? null;
  const gd = (s: Standing) => s.gamesFor - s.gamesAgainst;
  const pd = (s: Standing) => s.pointsFor - s.pointsAgainst;

  const byWins = [...rows.values()].sort((x, y) => y.won - x.won);
  const out: Standing[] = [];
  for (let i = 0; i < byWins.length;) {
    const tied = byWins.filter((s) => s.won === byWins[i]!.won);
    i += tied.length;
    if (tied.length === 2) {
      const w = mutual(tied[0]!.id, tied[1]!.id);
      out.push(...(w === tied[1]!.id ? [tied[1]!, tied[0]!] : tied));
      continue;
    }
    out.push(
      ...tied.sort((x, y) => {
        const byGames = gd(y) - gd(x) || pd(y) - pd(x);
        if (byGames !== 0) return byGames;
        const w = mutual(x.id, y.id);
        return w === x.id ? -1 : w === y.id ? 1 : ids.indexOf(x.id) - ids.indexOf(y.id);
      }),
    );
  }
  return out;
}

/**
 * Next Swiss round: entries in standings order are paired top-down with the highest one they
 * haven't met; with an odd number the lowest entry without an earlier bye rests.
 */
export function swissPairing(
  order: string[],
  played: (a: string, b: string) => boolean,
  hadBye: Set<string>,
): { pairs: [string, string][]; bye: string | null } {
  const list = [...order];
  let bye: string | null = null;
  if (list.length % 2 === 1) {
    const candidate = [...list].reverse().find((id) => !hadBye.has(id)) ?? list[list.length - 1]!;
    bye = candidate;
    list.splice(list.indexOf(candidate), 1);
  }
  // Backtracking keeps it rematch-free whenever that is possible.
  const solve = (rest: string[]): [string, string][] | null => {
    if (rest.length === 0) return [];
    const [first, ...others] = rest;
    for (const opp of others) {
      if (played(first!, opp)) continue;
      const tail = solve(others.filter((o) => o !== opp));
      if (tail) return [[first!, opp], ...tail];
    }
    return null;
  };
  const pairs =
    solve(list) ??
    // Everyone has met: fall back to plain top-down pairs.
    list.reduce<[string, string][]>(
      (acc, id, i) => (i % 2 === 0 ? [...acc, [id, list[i + 1]!]] : acc),
      [],
    );
  return { pairs, bye };
}

export const KO_SCORING_FROM = ['KO', 'QF', 'SF', 'F'] as const;
export type KoScoringFrom = (typeof KO_SCORING_FROM)[number];

export type EventScoring = ScoringRules & {
  koScoringFrom: string | null;
  koBestOf: number | null;
  koPointsToWin: number | null;
  koPointsCap: number | null;
};

export type MatchPosition = {
  /** Draw stage: GROUP, MAIN or KNOCKOUT (the knockout made after groups or hybrid). */
  stage: string;
  /** Draw type: KNOCKOUT, DOUBLE_KNOCKOUT, ROUND_ROBIN, … */
  type: string;
  /** Bracket size (knockout). */
  size: number;
  round: number;
  /** W, L (losers bracket) or F (double-knockout final). */
  bracket: string;
};

/**
 * Scoring for one match (D61): the category's scoring, or its knockout scoring for the
 * knockout stage ("KO") or from the quarter-final / semi-final / final on. Losers-bracket
 * rounds keep the normal scoring; the double-knockout final counts as a final.
 */
export function rulesForMatch(event: EventScoring, match: MatchPosition): ScoringRules {
  const base = { bestOf: event.bestOf, pointsToWin: event.pointsToWin, pointsCap: event.pointsCap };
  const from = event.koScoringFrom as KoScoringFrom | null;
  if (!from) return base;
  const knockout =
    match.stage === 'KNOCKOUT' || match.type === 'KNOCKOUT' || match.type === 'DOUBLE_KNOCKOUT';
  if (!knockout || match.bracket === 'L') return base;
  const ko = {
    bestOf: event.koBestOf ?? base.bestOf,
    pointsToWin: event.koPointsToWin ?? base.pointsToWin,
    pointsCap: event.koPointsCap ?? base.pointsCap,
  };
  if (from === 'KO') return match.stage === 'KNOCKOUT' ? ko : base;
  if (match.bracket === 'F') return ko;
  const roundsLeft = Math.log2(Math.max(2, match.size)) - match.round;
  const limit = from === 'QF' ? 2 : from === 'SF' ? 1 : 0;
  return roundsLeft <= limit ? ko : base;
}
