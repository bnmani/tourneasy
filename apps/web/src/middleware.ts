import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Redirects "/" to the best-matching locale (cookie → Accept-Language → nl).
// Auth gating is added here in Phase 1.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next.js internals and files with an extension (favicon.ico, robots.txt…).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
