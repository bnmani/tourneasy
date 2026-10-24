import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isDev = process.env.NODE_ENV === 'development';

// Baseline Content-Security-Policy: only our own origin may serve scripts, styles, images,
// fonts and API calls; no plugins, framing or foreign form targets. Next.js App Router emits
// inline bootstrap scripts, so 'unsafe-inline' is needed until a nonce-based policy replaces it
// in Phase 8 (together with the Sentry, R2 and map origins). Dev adds eval + HMR socket.
// Stripe (Phase 5): Stripe.js and its Payment Element frames, and its API for the form.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.stripe.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com${isDev ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server in .next/standalone (own server.js + real node_modules), so hosts
  // that copy the build elsewhere (Hostinger) don't depend on pnpm's workspace symlinks.
  // Tracing starts at the monorepo root so workspace packages are included.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // File tracing misses Prisma's generated client/query engine and argon2's platform binary
  // (loaded by a runtime-computed require).
  outputFileTracingIncludes: {
    '/**/*': ['../../node_modules/.prisma/client/**/*', '../../node_modules/@node-rs/argon2*/**/*'],
  },
  serverExternalPackages: ['@node-rs/argon2'],
  transpilePackages: ['@tourneasy/shared', '@tourneasy/db'],
  // Hostinger's shared build servers cap processes per account (spawn EAGAIN). Keep
  // `next build` to one worker and leave lint/typecheck to their own steps (`pnpm lint`,
  // `pnpm typecheck`), which run in CI and locally before every push.
  experimental: {
    cpus: 1,
    workerThreads: false,
    // Uploads (player/entry imports up to 2 MB, tournament logos up to 1 MB) go through server
    // actions, whose default limit is 1 MB.
    serverActions: { bodySizeLimit: '3mb' },
  },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
