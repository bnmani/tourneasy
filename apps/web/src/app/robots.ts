import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Portal, personal pages and the API are not for search engines.
      disallow: ['/api/', '/*/admin', '/*/account', '/*/login', '/*/register', '/*/players'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
