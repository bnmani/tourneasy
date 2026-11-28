/**
 * Umpire scoring: replays point and undo events onto a score. The database has no CHECK
 * constraints for umpire events, so these rules are the only enforcement of "a side is set
 * for POINT and not for UNDO".
 */
import { checkMatchScore, gameWinner, type Game, type ScoringRules } from './scoring';

export type ScoreEvent = { id: string; kind: 'POINT' | 'UNDO'; side?: 'A' | 'B' };

export type ApplyResult = {
  games: Game[];
  serving: 'A' | 'B';
  finished: boolean;
  /** Why the events could not all be applied; the other fields hold the state before that event. */
  rejected?: string;
};

/**
 * Applies events in order to `current` (finished games, plus a game in progress as last entry).
 * The rally winner serves next. An undo removes the last point scored in `events`, only while
 * the match is in progress; with no such point it is rejected. Processing stops at the first
 * rejected event.
 */
export function applyEvents(
  current: Game[],
  events: ScoreEvent[],
  rules: ScoringRules,
): ApplyResult {
  const games = current.map(([a, b]): Game => [a, b]);
  const scored: ('A' | 'B')[] = [];
  const isFinished = () => checkMatchScore(games, rules).ok;
  const state = (rejected?: string): ApplyResult => ({
    games: games.map(([a, b]): Game => [a, b]),
    serving: scored[scored.length - 1] ?? 'A',
    finished: isFinished(),
    ...(rejected ? { rejected } : {}),
  });

  for (const event of events) {
    if (event.kind === 'POINT') {
      if (!event.side) return state('pointNeedsSide');
      if (isFinished()) return state('matchFinished');
      let game = games[games.length - 1];
      if (!game || gameWinner(game, rules)) {
        game = [0, 0];
        games.push(game);
      }
      game[event.side === 'A' ? 0 : 1] += 1;
      scored.push(event.side);
    } else {
      if (event.side) return state('undoHasSide');
      if (isFinished()) return state('matchFinished');
      const side = scored.pop();
      const game = games[games.length - 1];
      if (!side || !game) return state('nothingToUndo');
      game[side === 'A' ? 0 : 1] -= 1;
      if (game[0] === 0 && game[1] === 0) games.pop();
    }
  }
  return state();
}
