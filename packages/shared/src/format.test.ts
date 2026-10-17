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
