/**
 * Email texts edited in the portal (D69), cached briefly: every email reads them, and a save
 * clears the cache so the next email uses the new text straight away.
 */
import { prisma } from '@tourneasy/db';
import type { AppLocale } from '@tourneasy/shared/i18n';

type Overrides = Record<AppLocale, Record<string, string>>;
const CACHE_MS = 30_000;
let cached: { value: Overrides; until: number } | null = null;

export async function emailTextOverrides(): Promise<Overrides> {
  if (cached && cached.until > Date.now()) return cached.value;
  const rows = await prisma.emailTextOverride.findMany({
    select: { locale: true, key: true, text: true },
  });
  const value: Overrides = { nl: {}, en: {} };
  for (const r of rows) {
    if (r.locale === 'nl' || r.locale === 'en') value[r.locale][r.key] = r.text;
  }
  cached = { value, until: Date.now() + CACHE_MS };
  return value;
}

export function clearEmailTextCache() {
  cached = null;
}
