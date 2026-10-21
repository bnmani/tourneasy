import { describe, expect, it } from 'vitest';
import { formatDate, formatEuro, formatTime } from './format';

// Intl inserts non-breaking spaces; normalise so assertions stay readable.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatEuro', () => {
  it('uses Dutch notation for nl', () => {
    expect(plain(formatEuro(1250, 'nl'))).toBe('€ 12,50');
    expect(plain(formatEuro(123456, 'nl'))).toBe('€ 1.234,56');
  });

  it('uses English notation for en', () => {
    expect(formatEuro(1250, 'en')).toBe('€12.50');
  });
});

describe('formatDate / formatTime', () => {
  // 2027-03-13 08:30 UTC = 09:30 in Amsterdam (CET, UTC+1)
  const winter = new Date('2027-03-13T08:30:00Z');
  // 2027-07-10 08:30 UTC = 10:30 in Amsterdam (CEST, UTC+2)
  const summer = new Date('2027-07-10T08:30:00Z');

  it('formats dates in Dutch', () => {
    expect(formatDate(winter, 'nl')).toBe('zaterdag 13 maart 2027');
  });

  it('formats dates in English', () => {
    expect(formatDate(winter, 'en')).toBe('Saturday, 13 March 2027');
  });

  it('converts to Europe/Amsterdam including daylight saving time', () => {
    expect(formatTime(winter, 'nl')).toBe('09:30');
    expect(formatTime(summer, 'nl')).toBe('10:30');
  });

  it('rolls over midnight in Amsterdam time', () => {
    expect(formatDate(new Date('2027-03-12T23:30:00Z'), 'nl')).toBe('zaterdag 13 maart 2027');
  });
});

describe('day ranges', () => {
  it('formats tournament days without time-zone shifts', async () => {
    const { formatDayRange, formatMonthYear, formatFeeRange } = await import('./format');
    expect(plain(formatDayRange('2027-03-13', '2027-03-14', 'nl'))).toMatch(
      /13\s*[–-]\s*14 mrt\.? 2027/,
    );
    expect(plain(formatDayRange('2027-03-13', '2027-03-13', 'en'))).toBe('13 Mar 2027');
    expect(formatMonthYear('2026-11-01', 'nl')).toBe('november 2026');
    expect(plain(formatFeeRange(1500, 1750, 'nl')!)).toBe('€ 15,00 – € 17,50');
    expect(formatFeeRange(null, null, 'nl')).toBeNull();
  });
});
