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

export const preferredEventOptions = ['Open singles', 'Open doubles', 'Mixed doubles'] as const;
