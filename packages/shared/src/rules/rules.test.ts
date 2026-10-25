import { describe, expect, it } from 'vitest';
import { ageOn, isMinor, parseDateOnly } from './age';
import { disciplinesForGender } from './eligibility';
import { isCommonPassword, parseLoginIdentifier } from './identity';
import { joinPhone, normalisePhone, splitPhone } from './phone';
import { checkedInFor } from './time';

describe('age', () => {
  const on = new Date(Date.UTC(2026, 9, 19)); // 19 Oct 2026

  it('counts whole years and respects the birthday', () => {
    expect(ageOn('2010-10-19', on)).toBe(16);
    expect(ageOn('2010-10-20', on)).toBe(15);
    expect(ageOn('1990-01-01', on)).toBe(36);
  });

  it('treats under-16s as minors', () => {
    expect(isMinor('2010-10-20', on)).toBe(true);
    expect(isMinor('2010-10-19', on)).toBe(false);
  });

  it('rejects impossible dates', () => {
    expect(parseDateOnly('2023-02-30')).toBeNull();
    expect(parseDateOnly('19-10-2026')).toBeNull();
    expect(parseDateOnly('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });
});

describe('login identifier', () => {
  it('recognises member numbers case-insensitively', () => {
    expect(parseLoginIdentifier(' te100245 ')).toEqual({ kind: 'memberNumber', value: 'TE100245' });
  });

  it('treats everything else as an email, lower-cased', () => {
    expect(parseLoginIdentifier('Daan.Jansen@Example.NL')).toEqual({
      kind: 'email',
      value: 'daan.jansen@example.nl',
    });
    expect(parseLoginIdentifier('TE12345').kind).toBe('email'); // too short for a member number
  });
});

describe('common passwords', () => {
  it('blocks well-known and repeated-character passwords', () => {
    expect(isCommonPassword('Wachtwoord123')).toBe(true);
    expect(isCommonPassword('aaaaaaaaaaaa')).toBe(true);
    expect(isCommonPassword('Shuttle-Smash-2027')).toBe(false);
  });
});

describe('phone numbers (D66)', () => {
  it('stores numbers internationally and accepts Dutch and imported formats', () => {
    expect(normalisePhone('06 12 34 56 78')).toBe('+31612345678');
    expect(normalisePhone('0031 6-12345678')).toBe('+31612345678');
    expect(normalisePhone('+32 470 12 34 56')).toBe('+32470123456');
    expect(normalisePhone('31612345678')).toBe('+31612345678');
    expect(normalisePhone('06 1234')).toBeNull();
    expect(normalisePhone('abc')).toBeNull();
    expect(joinPhone('NL', '0612345678')).toBe('+31612345678');
    expect(joinPhone('BE', '470123456')).toBe('+32470123456');
    expect(splitPhone('+352621123456')).toEqual({ country: 'LU', national: '621123456' });
    expect(splitPhone('0612345678')).toEqual({ country: 'NL', national: '612345678' });
  });

  it('offers only the categories a gender can play', () => {
    const all = ['HE', 'DE', 'HD', 'DD', 'GD'] as const;
    expect(disciplinesForGender(all, 'MALE')).toEqual(['HE', 'HD', 'GD']);
    expect(disciplinesForGender(all, 'FEMALE')).toEqual(['DE', 'DD', 'GD']);
    expect(disciplinesForGender(all, null)).toEqual([...all]);
  });
});

describe('check-in per day (D74)', () => {
  it('counts on the day, before the first day, but not for a later day', () => {
    const at = (iso: string) => new Date(iso);
    expect(checkedInFor(at('2027-03-13T08:00:00Z'), '2027-03-13', '2027-03-13')).toBe(true);
    expect(checkedInFor(at('2027-03-12T19:00:00Z'), '2027-03-13', '2027-03-13')).toBe(true);
    expect(checkedInFor(at('2027-03-13T08:00:00Z'), '2027-03-14', '2027-03-13')).toBe(false);
    expect(checkedInFor(at('2027-03-14T07:30:00Z'), '2027-03-14', '2027-03-13')).toBe(true);
    // 23:30 UTC on the 13th is already the 14th in the Netherlands.
    expect(checkedInFor(at('2027-03-13T23:30:00Z'), '2027-03-14', '2027-03-13')).toBe(true);
    expect(checkedInFor(null, '2027-03-13', '2027-03-13')).toBe(false);
  });
});
