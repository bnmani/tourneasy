/**
 * Who may enter which event (D48). Pure functions, so the entry form can show reasons before
 * submitting and the server re-checks with the same code.
 */
import { ageOn } from './age';

export type Discipline = 'HE' | 'DE' | 'HD' | 'DD' | 'GD';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export const DOUBLES: readonly Discipline[] = ['HD', 'DD', 'GD'];
export const isDoubles = (d: Discipline) => DOUBLES.includes(d);

export type EligibilityReason = 'gender' | 'tooOld' | 'tooYoung' | 'levelTooLow' | 'mixedNeedsBoth';

export type EligiblePlayer = {
  gender: Gender;
  dateOfBirth: Date | string;
  /** Level rank per discipline group (1 = strongest class); null when unknown. */
  levelRank: { singles: number | null; doubles: number | null; mixed: number | null };
};

export type EligibleEvent = {
  discipline: Discipline;
  ageCategory: {
    minAge: number | null;
    maxAge: number | null;
    referenceMonth: number;
    referenceDay: number;
  } | null;
  /** Rank of the event's level class (1 = strongest); null = open to all levels. */
  levelRank: number | null;
};

/** Gender a single player needs for the discipline; GD takes one of each. */
export function requiredGender(discipline: Discipline): Gender | null {
  if (discipline === 'HE' || discipline === 'HD') return 'MALE';
  if (discipline === 'DE' || discipline === 'DD') return 'FEMALE';
  return null;
}

/**
 * Age is taken on the category's reference day in the year the tournament starts
 * (Badminton Nederland: 1 January by default). "U17" has maxAge 16; "V35" has minAge 35.
 */
export function ageOnReferenceDay(
  dateOfBirth: Date | string,
  tournamentStartsOn: Date,
  category: { referenceMonth: number; referenceDay: number },
): number {
  const reference = new Date(
    Date.UTC(
      tournamentStartsOn.getUTCFullYear(),
      category.referenceMonth - 1,
      category.referenceDay,
    ),
  );
  return ageOn(dateOfBirth, reference);
}

function levelGroup(discipline: Discipline): keyof EligiblePlayer['levelRank'] {
  if (discipline === 'HE' || discipline === 'DE') return 'singles';
  if (discipline === 'GD') return 'mixed';
  return 'doubles';
}

/**
 * Reasons a player may not play in an event (empty = allowed). A player may enter their own
 * level class or a stronger one, never a weaker one; an unknown level is allowed (the
 * organiser checks).
 */
export function playerEligibility(
  player: EligiblePlayer,
  event: EligibleEvent,
  tournamentStartsOn: Date,
): EligibilityReason[] {
  const reasons: EligibilityReason[] = [];
  const gender = requiredGender(event.discipline);
  if (gender && player.gender !== gender) reasons.push('gender');
  if (event.discipline === 'GD' && player.gender === 'OTHER') reasons.push('gender');

  if (event.ageCategory) {
    const age = ageOnReferenceDay(player.dateOfBirth, tournamentStartsOn, event.ageCategory);
    if (event.ageCategory.maxAge !== null && age > event.ageCategory.maxAge) reasons.push('tooOld');
    if (event.ageCategory.minAge !== null && age < event.ageCategory.minAge)
      reasons.push('tooYoung');
  }

  const playerRank = player.levelRank[levelGroup(event.discipline)];
  if (event.levelRank !== null && playerRank !== null && event.levelRank > playerRank) {
    reasons.push('levelTooLow');
  }
  return reasons;
}

/** Extra check for a doubles pair: mixed doubles needs one man and one woman. */
export function pairEligibility(
  discipline: Discipline,
  a: { gender: Gender },
  b: { gender: Gender },
): EligibilityReason[] {
  if (discipline !== 'GD') return [];
  const genders = new Set([a.gender, b.gender]);
  return genders.has('MALE') && genders.has('FEMALE') ? [] : ['mixedNeedsBoth'];
}
