/** Platform member number, e.g. "TE100245" (DECISIONS.md D4). */
export const MEMBER_NUMBER_PATTERN = /^TE\d{6}$/i;

export type LoginIdentifier =
  { kind: 'email'; value: string } | { kind: 'memberNumber'; value: string };

/** Users log in with their email address or their member number. */
export function parseLoginIdentifier(raw: string): LoginIdentifier {
  const value = raw.trim();
  if (MEMBER_NUMBER_PATTERN.test(value))
    return { kind: 'memberNumber', value: value.toUpperCase() };
  return { kind: 'email', value: value.toLowerCase() };
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// Frequently used passwords that satisfy the length rule (incl. common Dutch ones).
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  '12345678910',
  '1111111111',
  '0000000000',
  'password12',
  'password123',
  'password1234',
  'passwordpassword',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'azertyuiop',
  'iloveyou12',
  'letmein123',
  'welcome123',
  'welkom1234',
  'welkom12345',
  'wachtwoord',
  'wachtwoord1',
  'wachtwoord123',
  'badminton1',
  'badminton123',
  'tourneasy1',
  'tourneasy123',
  'abcdefghij',
  'abc1234567',
  'football123',
  'voetbal123',
]);

export function isCommonPassword(password: string): boolean {
  const p = password.toLowerCase();
  if (COMMON_PASSWORDS.has(p)) return true;
  // One repeated character, e.g. "aaaaaaaaaa".
  return /^(.)\1+$/.test(p);
}
