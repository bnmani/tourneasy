import { describe, expect, it } from 'vitest';
import { tournamentSchema } from '../schemas/admin';
import { bundlePricesValid, bundleTotal, splitBundle } from './bundle-pricing';

describe('multi-category discount', () => {
  it('uses the price list and extends it by its last step', () => {
    expect(bundleTotal([], 2)).toBeNull();
    expect(bundleTotal([1500, 2500, 3200], 0)).toBe(0);
    expect(bundleTotal([1500, 2500, 3200], 2)).toBe(2500);
    expect(bundleTotal([1500, 2500, 3200], 4)).toBe(3900);
    expect(bundleTotal([1500], 3)).toBe(4500);
  });

  it('spreads what is owed by fee and never goes below zero', () => {
    expect(splitBundle(2500, 0, [1500, 1800])).toEqual([1136, 1364]);
    expect(splitBundle(3200, 2500, [1800])).toEqual([700]);
    expect(splitBundle(2500, 3000, [1500])).toEqual([0]);
    expect(splitBundle(1000, 0, [0, 0])).toEqual([500, 500]);
  });

  it('validates the list on the tournament form', () => {
    expect(bundlePricesValid([1500, 2500])).toBe(true);
    expect(bundlePricesValid([1500, 1200])).toBe(false);
    const base = {
      name: 'Open',
      startsOn: '2027-03-13',
      endsOn: '2027-03-14',
      registrationOpensAt: '2026-11-01T09:00',
      registrationClosesAt: '2027-02-27T23:59',
      withdrawalDeadline: '2027-02-20T23:59',
    };
    const ok = tournamentSchema.safeParse({ ...base, bundlePrices: ['15', '25,00', ''] });
    expect(ok.success && ok.data.bundlePricesCents).toEqual([1500, 2500]);
    const gap = tournamentSchema.safeParse({ ...base, bundlePrices: ['15', '', '30'] });
    expect(gap.success ? null : gap.error.issues[0]).toMatchObject({ path: ['bundlePrices', 1] });
    const lower = tournamentSchema.safeParse({ ...base, bundlePrices: ['25', '15'] });
    expect(lower.success ? null : lower.error.issues[0]).toMatchObject({ message: 'bundleOrder' });
  });
});
