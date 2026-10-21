/** HTTP caching helpers for public API responses (no server-only imports, so tests can use them). */
import { createHash } from 'node:crypto';

/**
 * Public, cacheable JSON (docs/api.md "Caching"): weak ETag over the body, `304` for a matching
 * `If-None-Match`, and a short shared cache lifetime.
 */
export function publicJson(request: Request, data: unknown, maxAgeSeconds = 60): Response {
  const body = JSON.stringify(data);
  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`;
  const headers: Record<string, string> = {
    'Cache-Control': `public, max-age=${maxAgeSeconds}, stale-while-revalidate=300`,
    ETag: etag,
  };
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((v) => v.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, {
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Query string → plain object for the Zod query schemas. */
export function queryObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
