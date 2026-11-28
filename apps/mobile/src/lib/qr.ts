/**
 * Reads the sign-in token from a scanned admin QR link. It may be in the fragment
 * (`#token=...`, preferred) or in the query (`?token=...`, what the website link uses today).
 * The caller sends it only in the sign-in request body. It is never logged or stored.
 */
export function extractQrToken(scanned: string): string | null {
  const match = /[#?&]token=([^&#\s]+)/.exec(scanned);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
