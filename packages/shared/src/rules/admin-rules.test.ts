import { describe, expect, it } from 'vitest';
import { eventSchema, tournamentSchema, venueSchema } from '../schemas/admin';
import { fieldErrors } from '../schemas/auth';
import { parseCsv, parseCsvObjects, toCsv } from './csv';
import { centsToEuroInput, parseEuroToCents } from './money';
import { amsterdamLocalToUtc, utcToAmsterdamLocal } from './time';

describe('Amsterdam time', () => {
  it('converts winter and summer wall-clock times to UTC', () => {
    expect(amsterdamLocalToUtc('2027-01-15T09:30')?.toISOString()).toBe('2027-01-15T08:30:00.000Z');
    expect(amsterdamLocalToUtc('2027-07-15T09:30')?.toISOString()).toBe('2027-07-15T07:30:00.000Z');
  });

  it('round-trips for form defaults', () => {
    const d = amsterdamLocalToUtc('2027-03-28T12:00')!; // DST starts that night
    expect(utcToAmsterdamLocal(d)).toBe('2027-03-28T12:00');
  });

  it('rejects garbage', () => {
    expect(amsterdamLocalToUtc('2027-13-01T10:00')).toBeNull();
    expect(amsterdamLocalToUtc('tomorrow')).toBeNull();
  });
});

describe('money', () => {
  it('parses Dutch and English notation', () => {
    expect(parseEuroToCents('12,50')).toBe(1250);
    expect(parseEuroToCents('€ 7.5')).toBe(750);
    expect(parseEuroToCents('0')).toBe(0);
    expect(parseEuroToCents('-5')).toBeNull();
    expect(parseEuroToCents('12,345')).toBeNull();
    expect(centsToEuroInput(1250)).toBe('12,50');
  });
});

describe('csv', () => {
  it('reads semicolon files with quotes and a BOM', () => {
    const text = '\uFEFFfirstName;lastName;note\r\nDaan;"Jansen";"says ""hi""; ok"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['firstName', 'lastName', 'note'],
      ['Daan', 'Jansen', 'says "hi"; ok'],
    ]);
    expect(parseCsvObjects(text)[0]).toEqual({
      firstname: 'Daan',
      lastname: 'Jansen',
      note: 'says "hi"; ok',
    });
  });

  it('writes Excel-friendly CSV and defuses formulas', () => {
    const csv = toCsv(['a', 'b'], [['=SUM(1)', 'x;y']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(`'=SUM(1);"x;y"`);
    expect(parseCsv(csv)[1]).toEqual(["'=SUM(1)", 'x;y']);
  });
});

describe('tournamentSchema', () => {
  const base = {
    name: 'Utrecht Open',
    startsOn: '2027-03-13',
    endsOn: '2027-03-14',
    registrationOpensAt: '2026-11-01T09:00',
    registrationClosesAt: '2027-02-27T23:59',
    withdrawalDeadline: '2027-02-20T23:59',
    dayStartTime: '09:00',
  };

  it('accepts a valid tournament and converts times to UTC', () => {
    const r = tournamentSchema.parse(base);
    expect(r.registrationClosesAt.toISOString()).toBe('2027-02-27T22:59:00.000Z');
    expect(r.type).toBe('SELF');
  });

  it('rejects wrong date order', () => {
    const r = tournamentSchema.safeParse({
      ...base,
      endsOn: '2027-03-12',
      registrationClosesAt: '2027-03-20T10:00',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(fieldErrors(r.error)).toMatchObject({
        endsOn: 'endBeforeStart',
        registrationClosesAt: 'deadlineAfterStart',
      });
    }
  });
});

describe('eventSchema', () => {
  it('needs group settings for the hybrid format', () => {
    const r = eventSchema.safeParse({
      discipline: 'HE',
      fee: '12,50',
      drawType: 'GROUPS_KNOCKOUT',
    });
    expect(!r.success && fieldErrors(r.error)).toMatchObject({
      groupSize: 'required',
      advancePerGroup: 'required',
    });
    const ok = eventSchema.parse({
      discipline: 'GD',
      fee: '10',
      drawType: 'GROUPS_KNOCKOUT',
      groupSize: '4',
      advancePerGroup: '2',
    });
    expect(ok.fee).toBe(1000);
  });
});

describe('venueSchema', () => {
  it('normalises Dutch postcodes and website URLs', () => {
    const v = venueSchema.parse({
      name: 'Sporthal',
      street: 'Weg',
      houseNumber: '1',
      postcode: '3511ab',
      city: 'Utrecht',
      province: 'UTRECHT',
      numberOfCourts: '8',
      website: 'sporthal.nl',
    });
    expect(v.postcode).toBe('3511 AB');
    expect(v.website).toBe('https://sporthal.nl');
    expect(venueSchema.safeParse({ ...v, postcode: '35 AB' }).success).toBe(false);
  });
});

describe('feedback rules (Oct 2026)', () => {
  const base = {
    name: 'Cup',
    startsOn: '2027-03-13',
    endsOn: '2027-03-14',
    registrationOpensAt: '2026-11-01T09:00',
    registrationClosesAt: '2027-02-27T23:59',
    withdrawalDeadline: '2027-02-20T23:59',
  };

  it('refuses withdrawals that stay open after entries close', () => {
    const r = tournamentSchema.safeParse({ ...base, withdrawalDeadline: '2027-03-01T12:00' });
    expect(!r.success && fieldErrors(r.error).withdrawalDeadline).toBe('withdrawalAfterClose');
    expect(
      tournamentSchema.safeParse({ ...base, withdrawalDeadline: '2027-02-27T23:59' }).success,
    ).toBe(true);
  });

  it('hybrid round robin + knockout needs odd matches and a knockout size', () => {
    const hybrid = { discipline: 'HD', fee: '10', drawType: 'HYBRID_ROUND_ROBIN_KNOCKOUT' };
    const missing = eventSchema.safeParse(hybrid);
    expect(!missing.success && fieldErrors(missing.error)).toMatchObject({
      matchesPerEntry: 'required',
      knockoutSize: 'required',
    });
    const even = eventSchema.safeParse({ ...hybrid, matchesPerEntry: '4', knockoutSize: '16' });
    expect(!even.success && fieldErrors(even.error).matchesPerEntry).toBe('oddMatches');
    const tooFew = eventSchema.safeParse({
      ...hybrid,
      matchesPerEntry: '5',
      knockoutSize: '16',
      maxEntries: '12',
    });
    expect(!tooFew.success && fieldErrors(tooFew.error).maxEntries).toBe('tooFewEntries');
    const ok = eventSchema.parse({
      ...hybrid,
      matchesPerEntry: '3',
      knockoutSize: '16',
      maxEntries: '32',
    });
    expect(ok).toMatchObject({ matchesPerEntry: 3, knockoutSize: 16 });
  });
});

describe('person names (letters only)', () => {
  it('accepts real names and rejects digits and symbols', async () => {
    const { personNameSchema, optionalPersonNameSchema } = await import('../schemas/auth');
    for (const ok of ['Anne-Marie', "van 't Hof", 'J. de Vries', 'Zoë', 'Ömer']) {
      expect(personNameSchema(80).safeParse(ok).success).toBe(true);
    }
    for (const bad of ['Daan2', 'R2-D2', 'Anna!', '#admin', '1990']) {
      expect(personNameSchema(80).safeParse(bad).error?.issues[0]?.message).toBe('lettersOnly');
    }
    expect(optionalPersonNameSchema(80).parse('')).toBeUndefined();
  });
});
