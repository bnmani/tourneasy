/** Site-wide settings managed by admins: currently the site theme (D42). */
import { prisma } from '@tourneasy/db';
import {
  DEFAULT_SITE_THEME,
  SITE_THEMES,
  siteThemeSchema,
  type SiteTheme,
} from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';

const THEME_KEY = 'theme';
const CACHE_MS = 60_000;

// Every page reads the theme, so it is kept in memory for a minute. One Node process serves
// the site; changing the theme clears the cache, so the admin sees the change at once.
let cached: { theme: SiteTheme; until: number } | null = null;

function isTheme(value: unknown): value is SiteTheme {
  return typeof value === 'string' && (SITE_THEMES as readonly string[]).includes(value);
}

export async function getSiteTheme(): Promise<SiteTheme> {
  if (cached && cached.until > Date.now()) return cached.theme;
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: THEME_KEY } });
    const theme = isTheme(row?.value) ? row.value : DEFAULT_SITE_THEME;
    cached = { theme, until: Date.now() + CACHE_MS };
    return theme;
  } catch (error) {
    // Pages must still render (with the default look) when the database is unreachable,
    // e.g. while prerendering at build time.
    console.error('[site-settings] theme lookup failed', error);
    return DEFAULT_SITE_THEME;
  }
}

export async function setSiteTheme(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const { theme } = parseInput(siteThemeSchema, input);
  const before = await getSiteTheme();
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: THEME_KEY },
      create: { key: THEME_KEY, value: theme },
      update: { value: theme },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'site.theme.update',
      entityType: 'SiteSetting',
      entityId: THEME_KEY,
      before: { theme: before },
      after: { theme },
      meta,
    });
  });
  cached = { theme, until: Date.now() + CACHE_MS };
  return theme;
}

/** Test helper: forget the cached theme. */
export function clearSiteThemeCache() {
  cached = null;
}
