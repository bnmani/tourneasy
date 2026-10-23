import { describe, expect, it } from 'vitest';
import { checkMatchScore, gameWinner, rulesForMatch, standings, swissPairing } from './scoring';

const bwf = { bestOf: 3, pointsToWin: 21, pointsCap: 30 };

describe('badminton scores', () => {
  it('accepts only valid final game scores', () => {
    const ok: [number, number][] = [
      [21, 19],
      [21, 0],
      [24, 22],
      [30, 29],
      [30, 28],
      [19, 21],
    ];
    const bad: [number, number][] = [
      [21, 20],
      [22, 21],
      [31, 29],
      [30, 27],
      [25, 21],
      [20, 18],
      [21, 21],
    ];
    expect(ok.map((g) => gameWinner(g, bwf))).toEqual(['A', 'A', 'A', 'A', 'A', 'B']);
    expect(bad.map((g) => gameWinner(g, bwf))).toEqual(bad.map(() => null));
    expect(gameWinner([15, 13], { bestOf: 3, pointsToWin: 15, pointsCap: 21 })).toBe('A');
  });

  it('checks the number of games and finds the winner', () => {
    expect(
      checkMatchScore(
        [
          [21, 15],
          [21, 18],
        ],
        bwf,
      ),
    ).toEqual({ ok: true, winner: 'A', games: [2, 0] });
    expect(
      checkMatchScore(
        [
          [15, 21],
          [21, 18],
          [19, 21],
        ],
        bwf,
      ),
    ).toMatchObject({ ok: true, winner: 'B' });
    expect(checkMatchScore([[21, 15]], bwf)).toEqual({ ok: false, error: 'tooFewGames' });
    expect(
      checkMatchScore(
        [
          [21, 15],
          [21, 18],
          [21, 3],
        ],
        bwf,
      ),
    ).toMatchObject({ error: 'tooManyGames', game: 3 });
    expect(
      checkMatchScore(
        [
          [21, 15],
          [21, 20],
        ],
        bwf,
      ),
    ).toMatchObject({ error: 'gameScore', game: 2 });
  });
});

describe('standings', () => {
  it('orders by wins, two tied by their mutual match', () => {
    const rows = standings(
      ['a', 'b', 'c'],
      [
        {
          a: 'a',
          b: 'b',
          winner: 'b',
          games: [
            [19, 21],
            [19, 21],
          ],
        },
        {
          a: 'a',
          b: 'c',
          winner: 'a',
          games: [
            [21, 5],
            [21, 5],
          ],
        },
        {
          a: 'b',
          b: 'c',
          winner: 'c',
          games: [
            [19, 21],
            [19, 21],
          ],
        },
      ],
    );
    // All one win and even games: three tied → point difference (a +28, b 0, c −28).
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    const two = standings(
      ['x', 'y', 'z'],
      [
        {
          a: 'x',
          b: 'y',
          winner: 'y',
          games: [
            [10, 21],
            [10, 21],
          ],
        },
        {
          a: 'x',
          b: 'z',
          winner: 'x',
          games: [
            [21, 0],
            [21, 0],
          ],
        },
        {
          a: 'y',
          b: 'z',
          winner: 'z',
          games: [
            [0, 21],
            [0, 21],
          ],
        },
      ],
    );
    expect(two.map((r) => r.won)).toEqual([1, 1, 1]);
  });

  it('counts a walkover as a straight-games win without points', () => {
    const [first] = standings(
      ['a', 'b'],
      [{ a: 'a', b: 'b', winner: 'a', games: [], walkover: true }],
    );
    expect(first).toMatchObject({ id: 'a', won: 1, gamesFor: 2, pointsFor: 0 });
  });
});

describe('Swiss pairing', () => {
  it('avoids rematches and gives the bye to someone who had none', () => {
    const met = new Set(['a|b', 'c|d']);
    const played = (x: string, y: string) => met.has([x, y].sort().join('|'));
    const { pairs, bye } = swissPairing(['a', 'b', 'c', 'd', 'e'], played, new Set(['e']));
    expect(bye).toBe('d');
    expect(pairs).toEqual([
      ['a', 'c'],
      ['b', 'e'],
    ]);
  });
});

describe('scoring per stage (D61)', () => {
  const event = {
    bestOf: 1,
    pointsToWin: 21,
    pointsCap: 30,
    koScoringFrom: 'SF' as string | null,
    koBestOf: 3,
    koPointsToWin: 21,
    koPointsCap: 30,
  };
  const ko = (round: number, size = 16, bracket = 'W') => ({
    stage: 'MAIN',
    type: 'KNOCKOUT',
    size,
    round,
    bracket,
  });

  it('uses the knockout scoring from the chosen round on', () => {
    expect(rulesForMatch(event, ko(1)).bestOf).toBe(1);
    expect(rulesForMatch(event, ko(2)).bestOf).toBe(1); // quarter-final
    expect(rulesForMatch(event, ko(3)).bestOf).toBe(3); // semi-final
    expect(rulesForMatch(event, ko(4)).bestOf).toBe(3); // final
    expect(rulesForMatch({ ...event, koScoringFrom: 'F' }, ko(3)).bestOf).toBe(1);
    expect(rulesForMatch({ ...event, koScoringFrom: 'QF' }, ko(2)).bestOf).toBe(3);
  });

  it('uses it for the whole knockout stage after groups, not in the groups', () => {
    const groups = { ...event, koScoringFrom: 'KO' };
    expect(
      rulesForMatch(groups, {
        stage: 'GROUP',
        type: 'GROUPS_KNOCKOUT',
        size: 4,
        round: 1,
        bracket: 'W',
      }).bestOf,
    ).toBe(1);
    expect(
      rulesForMatch(groups, {
        stage: 'KNOCKOUT',
        type: 'KNOCKOUT',
        size: 8,
        round: 1,
        bracket: 'W',
      }).bestOf,
    ).toBe(3);
  });

  it('keeps the normal scoring without a choice and in the losers bracket', () => {
    expect(rulesForMatch({ ...event, koScoringFrom: null }, ko(4)).bestOf).toBe(1);
    expect(
      rulesForMatch(event, {
        stage: 'MAIN',
        type: 'DOUBLE_KNOCKOUT',
        size: 8,
        round: 4,
        bracket: 'L',
      }).bestOf,
    ).toBe(1);
    expect(
      rulesForMatch(event, {
        stage: 'MAIN',
        type: 'DOUBLE_KNOCKOUT',
        size: 8,
        round: 1,
        bracket: 'F',
      }).bestOf,
    ).toBe(3);
  });
});
