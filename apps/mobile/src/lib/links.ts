/**
 * Web links the app opens. Terms and privacy are the live pages on tourneasy.com
 * (checked against the site). The help address is still a placeholder.
 */
export const links = {
  terms: 'https://tourneasy.com/en/terms',
  privacy: 'https://tourneasy.com/en/privacy',
  help: 'https://tourneasy.com/help',
  website: 'https://tourneasy.com/en',
} as const;

export const passwordMinLength = 12;

/**
 * Disciplines a player can choose, with the codes the website stores. Men's and women's
 * events need that gender; mixed doubles is open to both (same rule as the website).
 */
export const disciplineOptions = [
  { code: 'HE', label: "Men's singles", gender: 'MALE' },
  { code: 'DE', label: "Women's singles", gender: 'FEMALE' },
  { code: 'HD', label: "Men's doubles", gender: 'MALE' },
  { code: 'DD', label: "Women's doubles", gender: 'FEMALE' },
  { code: 'GD', label: 'Mixed doubles', gender: null },
] as const;

/** Disciplines that fit a gender. With no gender chosen yet, all of them are shown. */
export function disciplinesFor(gender: string) {
  return disciplineOptions.filter(
    (option) => !option.gender || !gender || option.gender === gender,
  );
}
