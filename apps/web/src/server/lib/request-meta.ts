/** Who/where a request came from — for rate limits, session lists and the audit log. */
export type RequestMeta = {
  ip?: string;
  userAgent?: string;
};

type HeaderSource = { get(name: string): string | null };

/**
 * Client IP behind Hostinger's CDN/LiteSpeed: prefer X-Real-IP, else the first
 * X-Forwarded-For entry. Spoofable by the client, so it only feeds rate limits and
 * informational fields — never authorization (per-account lockout covers brute force).
 */
export function requestMetaFromHeaders(headers: HeaderSource): RequestMeta {
  const realIp = headers.get('x-real-ip')?.trim();
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = (realIp || forwarded || undefined)?.slice(0, 64);
  const userAgent = headers.get('user-agent')?.slice(0, 300) ?? undefined;
  return { ip, userAgent };
}

/** Short, human-readable device label from a user agent ("Chrome on macOS"). */
export function describeUserAgent(userAgent?: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : /okhttp|Dalvik|CFNetwork|Expo/i.test(userAgent)
              ? 'App'
              : null;
  const os = /iPhone|iPad|iOS/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os;
}
