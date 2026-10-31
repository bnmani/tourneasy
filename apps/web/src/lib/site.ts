/** The live site. Every other host (the test site, localhost) stays out of search engines. */
export const PRODUCTION_HOST = 'tourneasy.com';

/** The public contact address (legal pages, footer). */
export const CONTACT_EMAIL = 'info@tourneasy.com';

export function isProductionSite(appUrl = process.env.APP_URL): boolean {
  try {
    return new URL(appUrl ?? '').hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

/**
 * Minutes between the server's own housekeeping runs (D90, D94). Each run wakes the database,
 * which then stays awake for 5 minutes and is billed per hour, so the live site runs every
 * 15 minutes and the test site every 60. HOUSEKEEPING_INTERVAL_MIN overrides it (5 to 1440).
 */
export function housekeepingMinutes(
  appUrl = process.env.APP_URL,
  override = process.env.HOUSEKEEPING_INTERVAL_MIN,
): number {
  const asked = Number(override);
  if (override && Number.isInteger(asked) && asked >= 5 && asked <= 1440) return asked;
  return isProductionSite(appUrl) ? 15 : 60;
}

/**
 * The address to send a visitor to when they came in on "www." of the site's own host, or
 * null. One address only: logins, passkeys (bound to the origin) and search engines need that.
 */
export function wwwRedirect(
  requestHost: string | null,
  pathAndQuery: string,
  appUrl = process.env.APP_URL,
): string | null {
  if (!requestHost || !appUrl) return null;
  let site: URL;
  try {
    site = new URL(appUrl);
  } catch {
    return null;
  }
  const host = requestHost.toLowerCase().replace(/:\d+$/, '');
  return host === `www.${site.hostname}` ? `${site.origin}${pathAndQuery}` : null;
}
