/**
 * Draw generation (Phase 6a, D55). Pure functions: the service loads entries, these decide
 * positions and matches, the service stores them. Randomness comes from an injectable `rng`
 * so tests are repeatable.
 *
 * Conventions: positions are 1-based; ranks are 1 = first seed. A knockout bracket has a
 * power-of-two size; missing entries are byes, placed against the top seeds.
 */

export type Rng = () => number;

/** Small seeded PRNG (mulberry32) for repeatable draws in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export type DrawCandidate = {
  id: string;
  /** Level strength: lower = stronger (LevelClass.rank, averaged for pairs); null = unknown. */
  strength: number | null;
  /** Clubs of the player(s), to keep club mates apart early. */
  clubs: string[];
  /** Entry time, the last tie-break for the seed suggestion. */
  enteredAt: Date;
};

/** Seed suggestion by level (D55): strongest first, unknown levels last, then earliest entry. */
export function suggestSeedOrder(entries: readonly DrawCandidate[]): string[] {
  return [...entries]
    .sort(
      (a, b) =>
        (a.strength ?? Number.POSITIVE_INFINITY) - (b.strength ?? Number.POSITIVE_INFINITY) ||
        a.enteredAt.getTime() - b.enteredAt.getTime(),
    )
    .map((e) => e.id);
}

/** BWF-style number of seeds for a knockout: 2 below 16 entries, 4 to 31, 8 to 63, 16 above. */
export function defaultSeedCount(entries: number): number {
  if (entries < 4) return 0;
  if (entries < 16) return 2;
  if (entries < 32) return 4;
  if (entries < 64) return 8;
  return 16;
}

export const nextPowerOfTwo = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/**
 * Standard bracket order: position i (0-based) holds rank order[i], so rank 1 meets the
 * lowest rank and ranks 1 and 2 can only meet in the final. [1,2] → [1,4,2,3] → …
 */
export function bracketOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

const sharesClub = (a: DrawCandidate | null, b: DrawCandidate | null) =>
  !!a && !!b && a.clubs.some((c) => b.clubs.includes(c));

/**
 * Knockout placement. Seeds go to their standard positions, drawn by lot within each band
 * (3–4, 5–8, 9–16) as in BWF draws; byes face the top seeds; the other entries are drawn
 * randomly and then swapped to avoid club mates meeting in the first round where possible.
 * Returns the entry per position (null = bye), length = bracket size.
 */
export function placeKnockout(
  entries: readonly DrawCandidate[],
  seedIds: readonly string[],
  rng: Rng,
): (string | null)[] {
  const size = nextPowerOfTwo(entries.length);
  const order = bracketOrder(size);
  const positionOfRank = new Map<number, number>();
  order.forEach((rank, i) => positionOfRank.set(rank, i));

  const slots: (string | null)[] = new Array(size).fill(null);
  const seeds = seedIds.filter((id) => entries.some((e) => e.id === id));
  // Seed bands [1], [2], [3–4], [5–8], [9–16] …: within a band the positions are drawn by lot.
  // Positions of ranks above the number of entries are byes (they face the top seeds).
  const bands: number[][] = [[1], [2]];
  for (let lo = 3; lo <= seeds.length; lo = 2 * lo - 1) {
    bands.push(Array.from({ length: lo - 1 }, (_, i) => lo + i)); // 3–4, 5–8, 9–16 …
  }
  for (const band of bands) {
    const bandSeeds = band.filter((r) => r <= seeds.length);
    if (bandSeeds.length === 0) continue;
    const positions = shuffle(
      band.filter((r) => r <= entries.length).map((r) => positionOfRank.get(r)!),
      rng,
    );
    bandSeeds.forEach((r, i) => (slots[positions[i]!] = seeds[r - 1]!));
  }
  const byePositions = new Set<number>();
  for (let r = entries.length + 1; r <= size; r++) byePositions.add(positionOfRank.get(r)!);

  const open = slots.map((s, i) => i).filter((i) => slots[i] === null && !byePositions.has(i));
  const unseeded = shuffle(
    entries.filter((e) => !seeds.includes(e.id)),
    rng,
  );
  open.forEach((pos, i) => (slots[pos] = unseeded[i]!.id));

  // Club spread: swap an unseeded entry with another unseeded one if that removes a clash.
  const byId = new Map(entries.map((e) => [e.id, e]));
  const at = (i: number) => (slots[i] ? byId.get(slots[i]!)! : null);
  const opponent = (i: number) => (i % 2 === 0 ? i + 1 : i - 1);
  const clash = (i: number) => sharesClub(at(i), at(opponent(i)));
  for (const i of open) {
    if (!clash(i)) continue;
    for (const j of open) {
      if (j === i || j === opponent(i)) continue;
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
      if (!clash(i) && !clash(j)) break;
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    }
  }
  return slots;
}

export type SlotRef = { match: number; slot: 'A' | 'B' };

/** A match in a generated draw; `a`/`b` are 1-based positions for first-round matches. */
export type MatchPlan = {
  number: number;
  bracket: 'W' | 'L' | 'F';
  round: number;
  a: number | null;
  b: number | null;
  next: SlotRef | null;
  loserNext: SlotRef | null;
};

/** Single knockout over `size` positions: rounds 1…log2(size), winners advance. */
export function knockoutPlan(size: number): MatchPlan[] {
  const plans: MatchPlan[] = [];
  const rounds = Math.log2(size);
  let number = 0;
  const firstOfRound: number[] = [];
  for (let round = 1; round <= rounds; round++) {
    firstOfRound[round] = number + 1;
    const count = size / 2 ** round;
    for (let i = 0; i < count; i++) {
      number += 1;
      plans.push({
        number,
        bracket: 'W',
        round,
        a: round === 1 ? 2 * i + 1 : null,
        b: round === 1 ? 2 * i + 2 : null,
        next: null,
        loserNext: null,
      });
    }
  }
  for (const p of plans) {
    if (p.round === rounds) continue;
    const index = p.number - firstOfRound[p.round]!;
    p.next = {
      match: firstOfRound[p.round + 1]! + Math.floor(index / 2),
      slot: index % 2 === 0 ? 'A' : 'B',
    };
  }
  return plans;
}

/**
 * Double knockout: the winners bracket as above, a losers bracket that alternates "losers
 * play each other" and "meet the next losers from the winners bracket" (in reversed order on
 * alternate rounds, to avoid early rematches), and a final between both bracket winners.
 */
export function doubleKnockoutPlan(size: number): MatchPlan[] {
  const m = Math.log2(size);
  const winners = knockoutPlan(size);
  const plans = [...winners];
  let number = winners.length;
  const wFirst = (round: number) => winners.find((p) => p.round === round)!.number;

  // Losers rounds 1 … 2m-2. Round counts: N/4, N/4, N/8, N/8, … , 1, 1.
  const lFirst: number[] = [];
  const lCount: number[] = [];
  for (let lr = 1; lr <= 2 * m - 2; lr++) {
    const count = size / 2 ** (Math.floor((lr + 1) / 2) + 1);
    lFirst[lr] = number + 1;
    lCount[lr] = count;
    for (let i = 0; i < count; i++) {
      number += 1;
      plans.push({
        number,
        bracket: 'L',
        round: lr,
        a: null,
        b: null,
        next: null,
        loserNext: null,
      });
    }
  }
  const final: MatchPlan = {
    number: number + 1,
    bracket: 'F',
    round: 1,
    a: null,
    b: null,
    next: null,
    loserNext: null,
  };
  plans.push(final);
  const byNumber = (n: number) => plans[n - 1]!;

  // Winners round 1 losers → losers round 1 (pairs).
  for (let i = 0; i < size / 2; i++) {
    byNumber(wFirst(1) + i).loserNext = {
      match: lFirst[1]! + Math.floor(i / 2),
      slot: i % 2 === 0 ? 'A' : 'B',
    };
  }
  // Winners round r ≥ 2 losers → losers round 2r-2, slot B (reversed on even r).
  for (let r = 2; r <= m; r++) {
    const count = size / 2 ** r;
    const lr = 2 * r - 2;
    for (let i = 0; i < count; i++) {
      const target = r % 2 === 0 ? count - 1 - i : i;
      byNumber(wFirst(r) + i).loserNext = { match: lFirst[lr]! + target, slot: 'B' };
    }
  }
  // Losers bracket winners: odd round → same index in next round slot A; even round → pairs.
  for (let lr = 1; lr <= 2 * m - 2; lr++) {
    for (let i = 0; i < lCount[lr]!; i++) {
      const p = byNumber(lFirst[lr]! + i);
      if (lr === 2 * m - 2) p.next = { match: final.number, slot: 'B' };
      else if (lr % 2 === 1) p.next = { match: lFirst[lr + 1]! + i, slot: 'A' };
      else p.next = { match: lFirst[lr + 1]! + Math.floor(i / 2), slot: i % 2 === 0 ? 'A' : 'B' };
    }
  }
  byNumber(wFirst(m)).next = { match: final.number, slot: 'A' };
  return plans;
}

/** All-play-all rounds (circle method); with an odd number one entry rests each round. */
export function roundRobinRounds<T>(entries: readonly T[]): [T, T][][] {
  const list: (T | null)[] = [...entries];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== null && b !== null && a !== undefined && b !== undefined)
        pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // Keep the first fixed, rotate the rest.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/**
 * Groups: seeds spread one per group (snake order), then the rest drawn randomly into the
 * group with the fewest entries, preferring a group without a club mate.
 */
export function distributeGroups(
  entries: readonly DrawCandidate[],
  seedIds: readonly string[],
  groupSize: number,
  rng: Rng,
): string[][] {
  const groupCount = Math.max(1, Math.ceil(entries.length / groupSize));
  const groups: DrawCandidate[][] = Array.from({ length: groupCount }, () => []);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const seeds = seedIds.filter((id) => byId.has(id));
  seeds.forEach((id, i) => {
    const round = Math.floor(i / groupCount);
    const g = round % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
    groups[g]!.push(byId.get(id)!);
  });
  for (const e of shuffle(
    entries.filter((x) => !seeds.includes(x.id)),
    rng,
  )) {
    const smallest = Math.min(...groups.map((g) => g.length));
    const open = groups.filter((g) => g.length === smallest);
    const noClash = open.filter((g) => !g.some((x) => sharesClub(x, e)));
    const pick = (noClash.length ? noClash : open)[
      Math.floor(rng() * (noClash.length || open.length))
    ]!;
    pick.push(e);
  }
  return groups.map((g) => g.map((e) => e.id));
}

/**
 * Hybrid (D36): every entry plays `perEntry` different opponents. Uses the first rounds of a
 * shuffled all-play-all schedule; with an odd number of entries, those who rested are paired
 * with each other where they haven't met. Returns matches grouped by round.
 */
export function hybridRounds<T extends { id: string }>(
  entries: readonly T[],
  perEntry: number,
  rng: Rng,
): [T, T][][] {
  const k = Math.min(perEntry, entries.length - 1);
  const all = roundRobinRounds(shuffle(entries, rng));
  const rounds = all.slice(0, k);
  if (entries.length % 2 === 1) {
    const played = new Set(rounds.flat().map(([a, b]) => [a.id, b.id].sort().join('|')));
    const count = new Map(entries.map((e) => [e.id, 0]));
    rounds.flat().forEach(([a, b]) => {
      count.set(a.id, count.get(a.id)! + 1);
      count.set(b.id, count.get(b.id)! + 1);
    });
    const resting = entries.filter((e) => count.get(e.id)! < k);
    const extra: [T, T][] = [];
    const used = new Set<string>();
    for (const a of resting) {
      if (used.has(a.id)) continue;
      const b = resting.find(
        (x) => x.id !== a.id && !used.has(x.id) && !played.has([a.id, x.id].sort().join('|')),
      );
      if (!b) continue;
      used.add(a.id);
      used.add(b.id);
      extra.push([a, b]);
    }
    if (extra.length) rounds.push(extra);
  }
  return rounds;
}

/** Swiss round 1: top half of the seed order against the bottom half (1 v n/2+1, …). */
export function swissFirstRound<T>(ordered: readonly T[]): { pairs: [T, T][]; bye: T | null } {
  const list = [...ordered];
  const bye = list.length % 2 === 1 ? list.pop()! : null;
  const half = list.length / 2;
  return { pairs: list.slice(0, half).map((a, i) => [a, list[half + i]!]), bye };
}

/** Number of Swiss rounds: enough to separate a winner (⌈log2 n⌉), at least 3. */
export const swissRoundCount = (entries: number) =>
  Math.max(3, Math.ceil(Math.log2(Math.max(2, entries))));
