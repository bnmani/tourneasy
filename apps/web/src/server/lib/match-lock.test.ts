import { describe, expect, it } from 'vitest';
import { isCheckInClosed, isScoreLocked } from './match-lock';

const none = { lockedAt: null, completedAt: null, scoreUnlockedAt: null };
// 23 Nov 2026, 22:30 UTC = 23:30 Amsterdam time.
const finished = new Date('2026-11-23T22:30:00Z');
const nextDay = new Date('2026-11-24T00:30:00+01:00');

describe('check-in closing', () => {
  it('stays open on the day the match finished, even late at night', () => {
    expect(
      isCheckInClosed({ ...none, completedAt: finished }, new Date('2026-11-23T21:59:00Z')),
    ).toBe(false);
  });
  it('closes from the next Dutch day', () => {
    expect(isCheckInClosed({ ...none, completedAt: finished }, nextDay)).toBe(true);
  });
  it('is open while not yet played', () => {
    expect(isCheckInClosed(none, nextDay)).toBe(false);
  });
  it('an owner lock closes it at once', () => {
    expect(isCheckInClosed({ ...none, lockedAt: finished, completedAt: finished }, finished)).toBe(
      true,
    );
  });
});

describe('score lock', () => {
  it('locks the score together with check-in', () => {
    expect(isScoreLocked({ ...none, completedAt: finished }, nextDay)).toBe(true);
  });
  it('an owner unlock opens the score but check-in stays closed', () => {
    const m = { ...none, lockedAt: finished, completedAt: finished, scoreUnlockedAt: new Date() };
    expect(isScoreLocked(m, nextDay)).toBe(false);
    expect(isCheckInClosed(m, nextDay)).toBe(true);
  });
  it('an owner unlock after the next-day lock opens the score only', () => {
    const m = { ...none, completedAt: finished, scoreUnlockedAt: new Date() };
    expect(isScoreLocked(m, nextDay)).toBe(false);
    expect(isCheckInClosed(m, nextDay)).toBe(true);
  });
});
