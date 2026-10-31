import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { sitemapEntries } from '@/server/services/public-service';

// Rebuilt at most once an hour.
export const revalidate = 3600;

/** Public pages in both languages. Player pages are left out on purpose (noindex, D46). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const entry = (path: string, lastModified?: Date) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`])),
      },
    }));

  const statics = [
    '',
    '/tournaments',
    '/calendar',
    '/venues',
    '/clubs',
    '/help',
    '/privacy',
    '/terms',
  ];
  let dynamic: MetadataRoute.Sitemap = [];
  try {
    const { tournaments, venues, clubs } = await sitemapEntries();
    dynamic = [
      ...tournaments.flatMap((t) => entry(`/tournaments/${t.slug}`, t.updatedAt)),
      ...venues.flatMap((v) => entry(`/venues/${v.slug}`, v.updatedAt)),
      ...clubs.flatMap((c) => entry(`/clubs/${c.slug}`, c.updatedAt)),
    ];
  } catch (error) {
    // No database while prerendering at build time: serve the static part.
    console.error('[sitemap] dynamic entries unavailable', error);
  }
  return [...statics.flatMap((p) => entry(p)), ...dynamic];
}
