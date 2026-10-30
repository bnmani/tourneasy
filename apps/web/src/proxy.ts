import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { contentSecurityPolicy } from './lib/csp';
import { isProductionSite } from './lib/site';

const intl = createMiddleware(routing);
const isDev = process.env.NODE_ENV === 'development';

// Next.js 16 "proxy" (formerly middleware): redirects "/" to the best-matching locale
// (cookie → Accept-Language → nl) and sets the page's script policy.
export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy({ nonce, dev: isDev });
  // On the request, so Next.js puts the nonce on its scripts; on the response for the browser.
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', policy);
  const response = intl(request);
  response.headers.set('Content-Security-Policy', policy);
  // Pages on the test site stay out of search results, even when linked from elsewhere.
  if (!isProductionSite()) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  // Skip API routes, Next.js internals and files with an extension (favicon.ico, robots.txt…).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
