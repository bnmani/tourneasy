import { ageFromIsoDate, isoFromDisplayDate } from '@/lib/signup';

describe('sign-up dates', () => {
  it('turns DD-MM-YYYY into YYYY-MM-DD', () => {
    expect(isoFromDisplayDate('12-03-1998')).toBe('1998-03-12');
  });

  it('rejects dates that do not exist or are not in the format', () => {
    expect(isoFromDisplayDate('31-02-2000')).toBeNull();
    expect(isoFromDisplayDate('1998-03-12')).toBeNull();
    expect(isoFromDisplayDate('12-3-1998')).toBeNull();
    expect(isoFromDisplayDate('')).toBeNull();
  });

  it('counts whole years, before and after the birthday', () => {
    const today = new Date(Date.UTC(2026, 10, 26)); // 26 November 2026
    expect(ageFromIsoDate('2010-11-26', today)).toBe(16);
    expect(ageFromIsoDate('2010-11-27', today)).toBe(15);
  });
});
