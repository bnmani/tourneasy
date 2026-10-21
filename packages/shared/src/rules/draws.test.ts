import { describe, expect, it } from 'vitest';
import {
  bracketOrder,
  defaultSeedCount,
  distributeGroups,
  doubleKnockoutPlan,
  hybridRounds,
  knockoutPlan,
  placeKnockout,
  roundRobinRounds,
  seededRng,
  suggestSeedOrder,
  swissFirstRound,
  type DrawCandidate,
} from './draws';

const entry = (
  id: string,
  strength: number | null = null,
  clubs: string[] = [],
): DrawCandidate => ({
  id,
  strength,
  clubs,
  enteredAt: new Date(`2026-11-0${(Number(id.replace(/\D/g, '')) % 9) + 1}`),
});
const ids = (n: number) => Array.from({ length: n }, (_, i) => entry(`e${i + 1}`));

describe('seeding', () => {
  it('suggests seeds by level: strongest first, unknown last', () => {
    expect(
      suggestSeedOrder([entry('a', 3), entry('b', null), entry('c', 1), entry('d', 2.5)]),
    ).toEqual(['c', 'd', 'a', 'b']);
    expect([3, 8, 20, 40, 70].map(defaultSeedCount)).toEqual([0, 2, 4, 8, 16]);
  });

  it('keeps seeds 1 and 2 in opposite halves and gives byes to the top seeds', () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const entries = ids(6);
    for (let s = 1; s < 30; s++) {
      const slots = placeKnockout(entries, ['e1', 'e2'], seededRng(s));
      expect(slots).toHaveLength(8);
      expect(slots[0]).toBe('e1');
      expect(slots[4]).toBe('e2'); // other half
      // The two byes face seeds 1 and 2.
      expect(slots[1]).toBeNull();
      expect(slots[5]).toBeNull();
      expect(new Set(slots.filter(Boolean)).size).toBe(6);
    }
  });

  it('draws seeds 3 and 4 by lot into the remaining quarters', () => {
    const seen = new Set<string>();
    for (let s = 1; s < 40; s++) {
      const slots = placeKnockout(ids(16), ['e1', 'e2', 'e3', 'e4'], seededRng(s));
      const q = (id: string) => Math.floor(slots.indexOf(id) / 4);
      expect(new Set(['e1', 'e2', 'e3', 'e4'].map(q)).size).toBe(4);
      seen.add(`${q('e3')}`);
    }
    expect(seen.size).toBe(2);
  });

  it('keeps club mates apart in round one when it can', () => {
    const entries = [
      entry('a', null, ['x']),
      entry('b', null, ['x']),
      entry('c', null, ['y']),
      entry('d', null, ['z']),
    ];
    for (let s = 1; s < 30; s++) {
      const slots = placeKnockout(entries, [], seededRng(s));
      const pairs = [slots.slice(0, 2), slots.slice(2, 4)];
      expect(pairs.some((p) => p.includes('a') && p.includes('b'))).toBe(false);
    }
  });
});

describe('match plans', () => {
  it('links a knockout from round one to the final', () => {
    const plan = knockoutPlan(8);
    expect(plan).toHaveLength(7);
    expect(plan[0]).toMatchObject({ round: 1, a: 1, b: 2, next: { match: 5, slot: 'A' } });
    expect(plan[3]).toMatchObject({ round: 1, a: 7, b: 8, next: { match: 6, slot: 'B' } });
    expect(plan[6]).toMatchObject({ round: 3, next: null });
  });

  it('builds a double knockout where everyone can lose once', () => {
    const plan = doubleKnockoutPlan(8);
    // 7 winners matches + 6 losers matches + final.
    expect(plan.filter((p) => p.bracket === 'W')).toHaveLength(7);
    expect(plan.filter((p) => p.bracket === 'L')).toHaveLength(6);
    expect(plan.filter((p) => p.bracket === 'F')).toHaveLength(1);
    // Every slot of every non-first-round match is fed by exactly one match.
    const feeds = new Map<string, number>();
    for (const p of plan)
      for (const ref of [p.next, p.loserNext])
        if (ref)
          feeds.set(`${ref.match}${ref.slot}`, (feeds.get(`${ref.match}${ref.slot}`) ?? 0) + 1);
    for (const p of plan) {
      if (p.bracket === 'W' && p.round === 1) continue;
      expect([feeds.get(`${p.number}A`), feeds.get(`${p.number}B`)]).toEqual([1, 1]);
    }
  });

  it('plays all-against-all, with a rest round for odd numbers', () => {
    const rounds = roundRobinRounds(['a', 'b', 'c', 'd', 'e']);
    expect(rounds).toHaveLength(5);
    const pairs = rounds.flat().map((p) => [...p].sort().join(''));
    expect(new Set(pairs).size).toBe(10);
  });

  it('spreads seeds and clubs over groups', () => {
    const entries = Array.from({ length: 12 }, (_, i) => entry(`e${i + 1}`, null, [`c${i % 3}`]));
    const groups = distributeGroups(entries, ['e1', 'e2', 'e3'], 4, seededRng(7));
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.length)).toEqual([4, 4, 4]);
    expect(groups.map((g) => g[0])).toEqual(['e1', 'e2', 'e3']);
  });

  it('gives every hybrid entry k different opponents', () => {
    for (const n of [8, 9, 12]) {
      const entries = ids(n);
      const rounds = hybridRounds(entries, 3, seededRng(n));
      const count = new Map<string, Set<string>>();
      for (const [a, b] of rounds.flat()) {
        count.set(a.id, (count.get(a.id) ?? new Set()).add(b.id));
        count.set(b.id, (count.get(b.id) ?? new Set()).add(a.id));
      }
      const played = [...count.values()].map((s) => s.size);
      expect(Math.min(...played)).toBeGreaterThanOrEqual(n % 2 === 0 ? 3 : 2);
      expect(Math.max(...played)).toBe(3);
    }
  });

  it('pairs Swiss round one top half against bottom half', () => {
    expect(swissFirstRound([1, 2, 3, 4, 5])).toEqual({
      pairs: [
        [1, 3],
        [2, 4],
      ],
      bye: 5,
    });
  });
});
