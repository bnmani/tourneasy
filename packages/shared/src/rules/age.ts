/** Players younger than this need parental consent and get minimal public data (GDPR/AVG). */
export const MINOR_AGE = 16;

/** Parses "YYYY-MM-DD" (or a Date) to a UTC midnight Date. Returns null when invalid. */
export function parseDateOnly(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject roll-overs such as 2023-02-30.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** Age in whole years on `on` (default: today). */
export function ageOn(dateOfBirth: string | Date, on: Date = new Date()): number {
  const dob = parseDateOnly(dateOfBirth);
  if (!dob) return Number.NaN;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isMinor(dateOfBirth: string | Date, on: Date = new Date()): boolean {
  return ageOn(dateOfBirth, on) < MINOR_AGE;
}
