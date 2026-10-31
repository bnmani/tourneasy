/**
 * Who may enter which event (D48). Pure functions, so the entry form can show reasons before
 * submitting and the server re-checks with the same code.
 */
import { ageOn } from './age';

export type Discipline = 'HE' | 'DE' | 'HD' | 'DD' | 'GD';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export const DOUBLES: readonly Discipline[] = ['HD', 'DD', 'GD'];
export const isDoubles = (d: Discipline) => DOUBLES.includes(d);

export type EligibilityReason =
  'gender' | 'tooOld' | 'tooYoung' | 'levelTooLow' | 'mixedNeedsBoth' | 'birthDateUnknown';

export type EligiblePlayer = {
  gender: Gender;
  /** Null for an imported player who hasn't filled it in yet (D95): no age-limited event. */
  dateOfBirth: Date | string | null;
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

/** Categories a player of this gender can play: men HE/HD/GD, women DE/DD/GD (D66). */
export function disciplinesForGender<D extends Discipline>(
  disciplines: readonly D[],
  gender: Gender | null | undefined,
): D[] {
  if (!gender) return [...disciplines];
  return disciplines.filter((d) => {
    const needed = requiredGender(d);
    return !needed || needed === gender;
  });
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

  // Age only matters for a category with an age limit: Senior is open to every age, so an
  // imported player without a date of birth may play there (D95).
  const category = event.ageCategory;
  if (category && (category.minAge !== null || category.maxAge !== null)) {
    if (player.dateOfBirth === null) reasons.push('birthDateUnknown');
    else {
      const age = ageOnReferenceDay(player.dateOfBirth, tournamentStartsOn, category);
      if (category.maxAge !== null && age > category.maxAge) reasons.push('tooOld');
      if (category.minAge !== null && age < category.minAge) reasons.push('tooYoung');
    }
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
