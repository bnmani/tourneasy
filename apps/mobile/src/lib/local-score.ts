import type { Tap } from '@/lib/seq';

export type GameScore = [number, number];

const TO_WIN = 21;
const CAP = 30;

function decided([a, b]: GameScore): boolean {
  const high = Math.max(a, b);
  return high >= CAP || (high >= TO_WIN && Math.abs(a - b) >= 2);
}

/**
 * The score as the phone shows it, from the taps made on this phone. It uses the default rules
 * (21, cap 30, best of 3) for display only: the website applies the match's real rules and
 * refuses a finish that is not decided.
 */
export function displayScore(taps: Tap[]): { games: GameScore[]; serving: 'A' | 'B' | null } {
  const games: GameScore[] = [];
  const scored: ('A' | 'B')[] = [];
  for (const tap of taps) {
    if (tap.kind === 'POINT') {
      let game = games[games.length - 1];
      if (!game || decided(game)) {
        game = [0, 0];
        games.push(game);
      }
      game[tap.side === 'A' ? 0 : 1] += 1;
      scored.push(tap.side);
    } else {
      const side = scored.pop();
      const game = games[games.length - 1];
      if (!side || !game) continue;
      game[side === 'A' ? 0 : 1] -= 1;
      if (game[0] === 0 && game[1] === 0) games.pop();
    }
  }
  return { games, serving: scored[scored.length - 1] ?? null };
}
