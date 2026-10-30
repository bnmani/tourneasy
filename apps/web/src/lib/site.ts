/** The live site. Every other host (the test site, localhost) stays out of search engines. */
export const PRODUCTION_HOST = 'tourneasy.com';

export function isProductionSite(appUrl = process.env.APP_URL): boolean {
  try {
    return new URL(appUrl ?? '').hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
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
