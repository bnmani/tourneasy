import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { clearSessionCookie, getActor, isSameOrigin } from '@/server/auth/web';
import { revokeSessionById } from '@/server/services/session-service';

type Context = { params: Promise<{ locale: string }> };

/**
 * POST /{locale}/logout — a plain form post instead of a server action, so logging out keeps
 * working on a page that was opened before a new deploy (server action ids and encrypted
 * arguments change per build).
 */
export async function POST(request: Request, { params }: Context) {
  const { locale } = await params;
  const target = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  // Same-site posts only (the same check as the API's cookie mutations).
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const actor = await getActor();
  if (actor) await revokeSessionById(actor.sessionId);
  await clearSessionCookie();
  return new Response(null, { status: 303, headers: { Location: `/${target}` } });
}
