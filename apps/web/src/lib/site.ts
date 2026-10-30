/** The live site. Every other host (the test site, localhost) stays out of search engines. */
export const PRODUCTION_HOST = 'tourneasy.com';

export function isProductionSite(appUrl = process.env.APP_URL): boolean {
  try {
    return new URL(appUrl ?? '').hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
}
