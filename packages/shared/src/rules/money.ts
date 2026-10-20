/**
 * "12,50", "12.50", "€ 12", "12" → 1250 cents. Returns null when not a valid,
 * non-negative amount with at most two decimals (max € 10.000).
 */
export function parseEuroToCents(value: string): number | null {
  const cleaned = value.replace(/€|\s/g, '');
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents <= 1_000_000 ? cents : null;
}

/** 1250 → "12,50" (form value; display formatting is in format.ts). */
export function centsToEuroInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}
