/**
 * Links this site to the iOS app, so passkeys made on the website also work in the app (Apple's
 * "webcredentials"). Apple fetches it from https://<host>/.well-known/apple-app-site-association.
 * APPLE_APP_IDS lists "<team id>.<bundle id>" entries, comma-separated.
 */
export function GET() {
  const apps = (process.env.APPLE_APP_IDS ?? '7J9CMK225U.com.tourneasy.app')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return Response.json(
    { webcredentials: { apps } },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
