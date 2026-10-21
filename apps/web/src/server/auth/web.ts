/**
 * Next.js glue for web sessions: the session cookie and the current Actor.
 * Business logic stays in services/session-service.ts.
 */
import 'server-only';
import { Role } from '@tourneasy/db';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { requestMetaFromHeaders, type RequestMeta } from '../lib/request-meta';
import { type Actor, actorFromAccessToken, actorFromWebToken } from '../services/session-service';

// __Host- prefix: cookie is Secure, host-only and path=/ — can't be set by subdomains.
const SECURE = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = SECURE ? '__Host-te_session' : 'te_session';

export async function setSessionCookie(token: string, expiresAt: Date, persistent: boolean) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    path: '/',
    // Without "remember me" it's a browser-session cookie (server still expires it).
    ...(persistent ? { expires: expiresAt } : {}),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/', secure: SECURE });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The logged-in user for this request (cached per request), or null. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = await readSessionToken();
  return token ? actorFromWebToken(token) : null;
});

export async function requireActor(locale: AppLocale, returnTo?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/${locale}/login${next}`);
  }
  return actor;
}

/** Pages for a role the user doesn't have answer 404, so they don't reveal admin URLs. */
export async function requireRole(
  locale: AppLocale,
  role: Role,
  returnTo?: string,
): Promise<Actor> {
  const actor = await requireActor(locale, returnTo);
  if (!actor.roles.includes(role)) notFound();
  return actor;
}

export function isPortalUser(actor: Pick<Actor, 'roles'> | null): boolean {
  return !!actor && (actor.roles.includes(Role.ADMIN) || actor.roles.includes(Role.ORGANISER));
}

/** Admin portal: administrators and delegated organisers (others get a 404). */
export async function requirePortal(locale: AppLocale, returnTo?: string): Promise<Actor> {
  const actor = await requireActor(locale, returnTo);
  if (!isPortalUser(actor)) notFound();
  return actor;
}

export async function currentRequestMeta(): Promise<RequestMeta> {
  return requestMetaFromHeaders(await headers());
}

/** Where to land after login: admins/organisers in the portal, players on their dashboard. */
export function homeFor(actor: Pick<Actor, 'roles'>, locale: AppLocale): string {
  return isPortalUser(actor) ? `/${locale}/admin` : `/${locale}/account`;
}

/**
 * REST API: Bearer access token (mobile) or the session cookie (web). Cookie-authenticated
 * mutations must come from our own origin (CSRF protection; Bearer requests are immune).
 */
export async function actorFromRequest(request: Request): Promise<Actor | null> {
  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return actorFromAccessToken(auth.slice(7).trim());
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isSameOrigin(request)) return null;
  const token = await readSessionToken();
  return token ? actorFromWebToken(token) : null;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
