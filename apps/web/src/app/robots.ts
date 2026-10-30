import type { MetadataRoute } from 'next';
import { isProductionSite } from '@/lib/site';

// Read at request time: the same build runs on the test and the live site.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  // The test site (and localhost) is never indexed: it would compete with the live site. It
  // stays crawlable on purpose: every page says noindex (X-Robots-Tag, set in proxy.ts), and
  // search engines only drop a page they can fetch. A disallow here would keep the test pages
  // Google indexed earlier in its results.
  if (!isProductionSite()) return { rules: { userAgent: '*', allow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Portal, personal pages and the API are not for search engines.
      disallow: [
        '/api/',
        '/*/admin',
        '/*/account',
        '/*/login',
        '/*/register',
        '/*/players',
        '/*/invites',
        '/*/tournaments/*/enter',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
