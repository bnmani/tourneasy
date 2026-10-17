import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Baseline security headers. A strict Content-Security-Policy is added in Phase 8
// once all third-party origins (Stripe, Sentry, R2, maps) are known.
const securityHeaders = [
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
  // File tracing misses Prisma's generated client and native query engine under pnpm.
  outputFileTracingIncludes: {
    '/**/*': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*'],
  },
  transpilePackages: ['@tourneasy/shared', '@tourneasy/db'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
