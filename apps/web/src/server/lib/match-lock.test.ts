import { describe, expect, it } from 'vitest';
import { isMatchLocked } from './match-lock';

const base = { lockedAt: null, completedAt: null, autoLockWaived: false };
// 23 Nov 2026, 23:30 Amsterdam time (22:30 UTC).
const finished = new Date('2026-11-23T22:30:00Z');

describe('isMatchLocked', () => {
  it('stays open on the day it finished, even late at night in Amsterdam', () => {
    expect(
      isMatchLocked({ ...base, completedAt: finished }, new Date('2026-11-23T21:59:00Z')),
    ).toBe(false);
  });
  it('locks from the next Dutch day', () => {
    expect(
      isMatchLocked({ ...base, completedAt: finished }, new Date('2026-11-24T00:30:00+01:00')),
    ).toBe(true);
  });
  it('is open while not yet played', () => {
    expect(isMatchLocked(base, new Date('2027-01-01T12:00:00Z'))).toBe(false);
  });
  it('a manual lock applies at once', () => {
    expect(isMatchLocked({ ...base, lockedAt: new Date(), completedAt: finished }, finished)).toBe(
      true,
    );
  });
  it('an owner unlock stops the automatic lock', () => {
    expect(
      isMatchLocked(
        { ...base, autoLockWaived: true, completedAt: finished },
        new Date('2026-12-01T12:00:00Z'),
      ),
    ).toBe(false);
  });
});
