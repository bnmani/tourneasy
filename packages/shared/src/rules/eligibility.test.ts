import { describe, expect, it } from 'vitest';
import { entrySchema, partnerIdentifierSchema } from '../schemas/registration';
import { ageOnReferenceDay, pairEligibility, playerEligibility } from './eligibility';

const STARTS = new Date('2027-03-13T00:00:00Z');
const REF = { referenceMonth: 1, referenceDay: 1 };
const noLevel = { singles: null, doubles: null, mixed: null };
const man = { gender: 'MALE' as const, dateOfBirth: '1995-04-12', levelRank: noLevel };
const woman = { ...man, gender: 'FEMALE' as const };

describe('playerEligibility', () => {
  it('checks gender per discipline', () => {
    const event = (discipline: 'HE' | 'DD' | 'GD') => ({
      discipline,
      ageCategory: null,
      levelRank: null,
    });
    expect(playerEligibility(man, event('HE'), STARTS)).toEqual([]);
    expect(playerEligibility(woman, event('HE'), STARTS)).toEqual(['gender']);
    expect(playerEligibility(man, event('DD'), STARTS)).toEqual(['gender']);
    expect(playerEligibility(woman, event('GD'), STARTS)).toEqual([]);
  });

  it('uses the age on the reference day of the tournament year', () => {
    const u17 = {
      discipline: 'HE' as const,
      levelRank: null,
      ageCategory: { ...REF, minAge: null, maxAge: 16 },
    };
    // Born 2010-02-01: 16 on 1 Jan 2027 → still U17, even though 17 on the tournament day.
    expect(ageOnReferenceDay('2010-02-01', STARTS, REF)).toBe(16);
    expect(playerEligibility({ ...man, dateOfBirth: '2010-02-01' }, u17, STARTS)).toEqual([]);
    expect(playerEligibility({ ...man, dateOfBirth: '2009-12-31' }, u17, STARTS)).toEqual([
      'tooOld',
    ]);
    const v35 = {
      discipline: 'HE' as const,
      levelRank: null,
      ageCategory: { ...REF, minAge: 35, maxAge: null },
    };
    expect(playerEligibility(man, v35, STARTS)).toEqual(['tooYoung']);
    expect(playerEligibility({ ...man, dateOfBirth: '1991-06-01' }, v35, STARTS)).toEqual([]);
  });

  it('allows the own or a stronger level class, not a weaker one', () => {
    const levelC = { ...man, levelRank: { singles: 3, doubles: 2, mixed: null } };
    const event = (levelRank: number, discipline: 'HE' | 'HD' | 'GD' = 'HE') => ({
      discipline,
      ageCategory: null,
      levelRank,
    });
    expect(playerEligibility(levelC, event(3), STARTS)).toEqual([]); // C in C
    expect(playerEligibility(levelC, event(1), STARTS)).toEqual([]); // C in A
    expect(playerEligibility(levelC, event(4), STARTS)).toEqual(['levelTooLow']); // C in D
    expect(playerEligibility(levelC, event(3, 'HD'), STARTS)).toEqual(['levelTooLow']); // doubles is B
    expect(playerEligibility(levelC, event(4, 'GD'), STARTS)).toEqual([]); // mixed level unknown
  });
});

describe('pairEligibility', () => {
  it('needs one man and one woman in mixed doubles', () => {
    expect(pairEligibility('GD', man, woman)).toEqual([]);
    expect(pairEligibility('GD', woman, woman)).toEqual(['mixedNeedsBoth']);
    expect(pairEligibility('HD', man, man)).toEqual([]);
  });
});

describe('entry schema', () => {
  it('needs at least one event and accepted terms', () => {
    const r = entrySchema.safeParse({ events: [], acceptTerms: false });
    expect(r.success).toBe(false);
    const ok = entrySchema.parse({
      events: [{ eventId: '0b6f3f9e-2f5c-4c1b-9a51-1f6c2d3e4a5b', partner: ' te100023 ' }],
      acceptTerms: true,
      phone: '',
    });
    expect(ok.events[0]).toMatchObject({ partner: 'te100023', lookingForPartner: false });
    expect(ok.phone).toBeUndefined();
  });

  it('accepts a member number or email as partner', () => {
    expect(partnerIdentifierSchema.safeParse('TE100023').success).toBe(true);
    expect(partnerIdentifierSchema.safeParse('sem@example.nl').success).toBe(true);
    expect(partnerIdentifierSchema.safeParse('Sem de Vries').success).toBe(false);
  });
});
