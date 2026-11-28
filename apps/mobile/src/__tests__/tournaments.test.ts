import { formatFee, pickLocale } from '@/lib/tournaments';

describe('pickLocale', () => {
  const text = { en: 'Youth tournament', nl: 'Jeugdtoernooi' };

  it('picks the reader’s language', () => {
    expect(pickLocale(text, 'nl')).toBe('Jeugdtoernooi');
    expect(pickLocale(text, 'en')).toBe('Youth tournament');
  });

  it('falls back to the other language when one is missing', () => {
    expect(pickLocale({ nl: 'Alleen Nederlands' }, 'en')).toBe('Alleen Nederlands');
  });

  it('returns null for nothing, so the screen shows nothing instead of crashing', () => {
    expect(pickLocale(null, 'en')).toBeNull();
    expect(pickLocale({ en: '  ' }, 'en')).toBeNull();
  });

  it('passes plain text through', () => {
    expect(pickLocale('Plain', 'en')).toBe('Plain');
  });
});

describe('formatFee', () => {
  it('shows cents instead of rounding them away', () => {
    expect(formatFee(750, 750, 'en-GB')).toBe('€7.50');
    expect(formatFee(600, 750, 'en-GB')).toBe('€6–€7.50');
  });

  it('leaves out ,00 for whole euros', () => {
    expect(formatFee(1500, null, 'en-GB')).toBe('€15');
  });
});
