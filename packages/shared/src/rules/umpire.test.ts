import { describe, expect, it } from 'vitest';
import { umpireEventSchema } from '../schemas/umpire';
import { applyEvents, type ScoreEvent } from './umpire';
const rules = { bestOf: 3, pointsToWin: 21, pointsCap: 30 };

let n = 0;
const point = (side: 'A' | 'B'): ScoreEvent => ({ id: `e${n++}`, kind: 'POINT', side });
const undo = (): ScoreEvent => ({ id: `e${n++}`, kind: 'UNDO' });
const points = (side: 'A' | 'B', count: number) => Array.from({ length: count }, () => point(side));

describe('applyEvents', () => {
  it('counts points and lets the rally winner serve', () => {
    const r = applyEvents([], [point('A'), point('B'), point('B')], rules);
    expect(r).toEqual({ games: [[1, 2]], serving: 'B', finished: false });
  });

  it('ends a game at 21 with a two-point lead and starts the next one', () => {
    const r = applyEvents([], [...points('A', 21), point('B')], rules);
    expect(r.games).toEqual([[21, 0], [0, 1]]);
    expect(r.finished).toBe(false);
  });

  it('plays on at 20-20 and ends at the 30 cap', () => {
    const deuce = [...points('A', 20), ...points('B', 20)];
    expect(applyEvents([], [...deuce, point('A')], rules).games).toEqual([[21, 20]]);
    const rally = Array.from({ length: 9 }, () => [point('A'), point('B')]).flat();
    const r = applyEvents([], [...deuce, ...rally, point('A'), point('A')], rules);
    expect(r.games[0]).toEqual([30, 29]);
    expect(r.games).toHaveLength(2);
  });

  it('finishes the match with two games won', () => {
    const r = applyEvents([], [...points('A', 21), ...points('A', 21)], rules);
    expect(r.games).toEqual([[21, 0], [21, 0]]);
    expect(r.finished).toBe(true);
  });

  it('rejects a point after the match is finished', () => {
    const r = applyEvents([[21, 5], [21, 5]], [point('A')], rules);
    expect(r.rejected).toBeTruthy();
    expect(r.games).toEqual([[21, 5], [21, 5]]);
    expect(r.finished).toBe(true);
  });

  it('undo after a game is won returns to the previous score', () => {
    const r = applyEvents([], [...points('B', 5), ...points('A', 21), undo()], rules);
    expect(r.games).toEqual([[20, 5]]);
    expect(r.serving).toBe('A');
    expect(r.finished).toBe(false);
  });

  it('undo that empties a game removes it and restores the server', () => {
    const r = applyEvents([], [...points('A', 21), point('B'), undo()], rules);
    expect(r.games).toEqual([[21, 0]]);
    expect(r.serving).toBe('A');
  });

  it('rejects an undo with no points to remove', () => {
    const r = applyEvents([], [undo()], rules);
    expect(r.rejected).toBeTruthy();
    expect(r.games).toEqual([]);
  });

  it('cannot undo points that are already in current', () => {
    const r = applyEvents([[3, 2]], [point('A'), undo(), undo()], rules, 'B');
    expect(r).toEqual({ games: [[3, 2]], serving: 'B', finished: false, rejected: 'nothingToUndo' });
  });

  it('starts from the given initial server', () => {
    expect(applyEvents([], [], rules, 'B').serving).toBe('B');
    expect(applyEvents([], [point('A')], rules, 'B').serving).toBe('A');
  });

  it('rejects an undo once the match is finished', () => {
    const r = applyEvents([], [...points('A', 42), undo()], rules);
    expect(r.rejected).toBeTruthy();
    expect(r.finished).toBe(true);
    expect(r.games).toEqual([[21, 0], [21, 0]]);
  });

  it('rejects a point without a side and an undo with a side', () => {
    expect(applyEvents([], [{ id: 'x', kind: 'POINT' }], rules).rejected).toBeTruthy();
    expect(applyEvents([], [point('A'), { id: 'y', kind: 'UNDO', side: 'A' }], rules)).toMatchObject({
      rejected: expect.any(String),
      games: [[1, 0]],
    });
  });

  it('keeps the state before the rejected event and stops there', () => {
    const r = applyEvents([], [point('A'), undo(), undo(), point('B')], rules);
    expect(r.rejected).toBeTruthy();
    expect(r.games).toEqual([]);
  });
});

describe('umpireEventSchema', () => {
  it('requires a side for POINT and forbids one for UNDO', () => {
    expect(umpireEventSchema.safeParse({ id: 'a', kind: 'POINT', side: 'A' }).success).toBe(true);
    expect(umpireEventSchema.safeParse({ id: 'a', kind: 'UNDO' }).success).toBe(true);
    expect(umpireEventSchema.safeParse({ id: 'a', kind: 'POINT' }).success).toBe(false);
    expect(umpireEventSchema.safeParse({ id: 'a', kind: 'UNDO', side: 'B' }).success).toBe(false);
  });
});
