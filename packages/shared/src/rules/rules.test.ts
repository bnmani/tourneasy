import { describe, expect, it } from 'vitest';
import { ageOn, isMinor, parseDateOnly } from './age';
import { isCommonPassword, parseLoginIdentifier } from './identity';

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
