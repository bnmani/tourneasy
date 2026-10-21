/**
 * Multi-category discount (D52). An organiser can set the total a player pays for entering
 * 1, 2, 3 … categories of one tournament, e.g. [1500, 2500, 3200] = €15 / €25 / €32. Without
 * a price list every category costs its own fee.
 */

/** Total for `count` paid categories, or null when the tournament has no price list. */
export function bundleTotal(prices: readonly number[], count: number): number | null {
  if (prices.length === 0) return null;
  if (count <= 0) return 0;
  if (count <= prices.length) return prices[count - 1]!;
  // More categories than the list covers: each extra one costs the last step of the list.
  const last = prices[prices.length - 1]!;
  const step = prices.length >= 2 ? last - prices[prices.length - 2]! : last;
  return last + (count - prices.length) * step;
}

/**
 * Splits what is still owed (bundle total minus what was already paid) over the unpaid
 * categories, in proportion to their normal fees; rounding cents go to the last one.
 */
export function splitBundle(
  total: number,
  alreadyPaid: number,
  unpaidFees: readonly number[],
): number[] {
  if (unpaidFees.length === 0) return [];
  const due = Math.max(0, total - alreadyPaid);
  const sum = unpaidFees.reduce((n, f) => n + f, 0);
  const weights = sum > 0 ? unpaidFees : unpaidFees.map(() => 1);
  const weightSum = sum > 0 ? sum : unpaidFees.length;
  const amounts = weights.map((w) => Math.floor((due * w) / weightSum));
  amounts[amounts.length - 1]! += due - amounts.reduce((n, a) => n + a, 0);
  return amounts;
}

/** Validates a price list: starts at one category, every step costs at least as much as the last. */
export function bundlePricesValid(prices: readonly number[]): boolean {
  return prices.every((p, i) => p >= 0 && (i === 0 || p >= prices[i - 1]!));
}
