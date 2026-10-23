/**
 * Phone numbers (D66): stored in international format (E.164, e.g. +31612345678). Forms ask
 * for the country and the number separately; older Dutch-style input ("06 12 34 56 78",
 * "0031…") is still accepted and converted.
 */

/** Countries offered in the phone field: ISO code and dialling code. Netherlands first. */
export const PHONE_COUNTRIES: readonly (readonly [string, string])[] = [
  ['NL', '31'],
  ['BE', '32'],
  ['DE', '49'],
  ['FR', '33'],
  ['GB', '44'],
  ['LU', '352'],
  ['AT', '43'],
  ['CH', '41'],
  ['DK', '45'],
  ['SE', '46'],
  ['NO', '47'],
  ['FI', '358'],
  ['IE', '353'],
  ['ES', '34'],
  ['PT', '351'],
  ['IT', '39'],
  ['GR', '30'],
  ['PL', '48'],
  ['CZ', '420'],
  ['HU', '36'],
  ['RO', '40'],
  ['BG', '359'],
  ['UA', '380'],
  ['TR', '90'],
  ['MA', '212'],
  ['EG', '20'],
  ['NG', '234'],
  ['ZA', '27'],
  ['SR', '597'],
  ['CW', '599'],
  ['AW', '297'],
  ['US', '1'],
  ['BR', '55'],
  ['IN', '91'],
  ['PK', '92'],
  ['BD', '880'],
  ['LK', '94'],
  ['NP', '977'],
  ['CN', '86'],
  ['HK', '852'],
  ['TW', '886'],
  ['JP', '81'],
  ['KR', '82'],
  ['ID', '62'],
  ['MY', '60'],
  ['SG', '65'],
  ['TH', '66'],
  ['VN', '84'],
  ['PH', '63'],
  ['AU', '61'],
  ['NZ', '64'],
];

const dialOf = new Map(PHONE_COUNTRIES);

/**
 * International format, or null when it isn't a phone number. Accepts "+…", "00…" and Dutch
 * national numbers ("06…", "010…"); spaces, dots, dashes and brackets are ignored.
 */
export function normalisePhone(raw: string): string | null {
  const v = raw.trim().replace(/[\s.\-()/]/g, '');
  if (!/^\+?\d+$/.test(v)) return null;
  const e164 = v.startsWith('+')
    ? v
    : v.startsWith('00')
      ? `+${v.slice(2)}`
      : v.startsWith('0')
        ? `+31${v.slice(1)}`
        : // Imports often drop the "+": "31612345678" with a known dialling code.
          v.length >= 10 && PHONE_COUNTRIES.some(([, dial]) => v.startsWith(dial))
          ? `+${v}`
          : null;
  if (!e164 || !/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  // Dutch numbers: 9 digits after +31 (mobile 6xxxxxxxx, landlines with area code).
  if (e164.startsWith('+31') && e164.length !== 12) return null;
  return e164;
}

/** Builds the stored number from the country and the number as typed (leading 0 dropped). */
export function joinPhone(country: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  return `+${dialOf.get(country) ?? '31'}${digits}`;
}

/** Splits a stored number into country and national number for the form (Dutch by default). */
export function splitPhone(value: string | null | undefined): {
  country: string;
  national: string;
} {
  const e164 = value ? normalisePhone(value) : null;
  if (!e164) return { country: 'NL', national: value?.replace(/\D/g, '') ?? '' };
  // Longest dialling code first (+352 before +35…); +1 and +7 style codes last.
  const match = [...PHONE_COUNTRIES]
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, dial]) => e164.startsWith(`+${dial}`));
  if (!match) return { country: 'NL', national: e164.slice(1) };
  return { country: match[0], national: e164.slice(match[1].length + 1) };
}
