/** "Utrecht Open 2027!" → "utrecht-open-2027" (accents removed, max 80 chars). */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

/** First free slug: base, base-2, base-3 … (`exists` checks the table). */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** { nl, en? } JSON for organiser-written text, or null when both are empty. */
export function localized(nl?: string, en?: string): { nl: string; en?: string } | null {
  if (!nl && !en) return null;
  return en ? { nl: nl ?? en, en } : { nl: nl! };
}
