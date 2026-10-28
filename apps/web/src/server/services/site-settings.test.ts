import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { prisma, Role } from '@tourneasy/db';
import { SITE_THEMES } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { actorFromWebToken, createWebSession, type Actor } from './session-service';
import { clearSiteThemeCache, getSiteTheme, setSiteTheme } from './site-settings-service';

beforeEach(async () => {
  await resetDatabase();
  clearSiteThemeCache();
});

async function actorFor(userId: string): Promise<Actor> {
  const { token } = await createWebSession(userId, meta, true);
  return (await actorFromWebToken(token))!;
}

describe('site theme', () => {
  it('defaults to Midnight Cobalt and lets an owner switch (D79), audited', async () => {
    expect(await getSiteTheme()).toBe('midnight');
    const { userId } = await createPlayer();
    await prisma.userRole.create({ data: { userId, role: Role.OWNER } });
    const admin = await actorFor(userId);

    await setSiteTheme(admin, { theme: 'night' }, meta);
    expect(await getSiteTheme()).toBe('night');
    clearSiteThemeCache();
    expect(await getSiteTheme()).toBe('night'); // read back from the database
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'site.theme.update' },
    });
    expect(audit).toMatchObject({ before: { theme: 'midnight' }, after: { theme: 'night' } });
  });

  it('refuses non-admins and unknown themes', async () => {
    const player = await actorFor((await createPlayer()).userId);
    await expect(setSiteTheme(player, { theme: 'teal' }, meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    // Admins too: Display is for owners (D79).
    const plainAdmin = await createPlayer();
    await prisma.userRole.create({ data: { userId: plainAdmin.userId, role: Role.ADMIN } });
    await expect(
      setSiteTheme(await actorFor(plainAdmin.userId), { theme: 'teal' }, meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    const { userId } = await createPlayer();
    await prisma.userRole.create({ data: { userId, role: Role.OWNER } });
    const admin = await actorFor(userId);
    await expect(setSiteTheme(admin, { theme: 'pink' }, meta)).rejects.toMatchObject({
      code: 'validation',
    });
    expect(await getSiteTheme()).toBe('midnight');
  });
});

// WCAG 2.1 AA: every text/background pair the themes use must reach 4.5:1.
describe('theme contrast', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
    'utf8',
  );
  function tokens(theme: string): Record<string, string> {
    const block = new RegExp(`\\[data-theme='${theme}'\\][^{]*\\{([^}]*)\\}`).exec(css)?.[1];
    if (!block) throw new Error(`no block for ${theme}`);
    return Object.fromEntries(
      [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
    );
  }
  function luminance(hex: string) {
    const [r, g, b] = hex
      .slice(1)
      .match(/../g)!
      .map((h) => parseInt(h, 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
  const PAIRS: [string, string][] = [
    ['foreground', 'background'],
    ['card-foreground', 'card'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['primary-foreground', 'primary'],
    ['secondary-foreground', 'secondary'],
    ['accent-foreground', 'accent'],
    ['destructive', 'background'],
    ['destructive-foreground', 'destructive'],
    ['brand-foreground', 'brand'],
    ['accent-text', 'card'],
    ['accent-text', 'background'],
    ['hero-foreground', 'hero'],
    ['hero-muted', 'hero'],
    ['hero-card-foreground', 'hero-card'],
    ['live-foreground', 'live'],
  ];

  for (const theme of SITE_THEMES) {
    it(`${theme} meets AA for text`, () => {
      const t = tokens(theme);
      const failures = PAIRS.filter(([fg, bg]) => ratio(t[fg]!, t[bg]!) < 4.5).map(
        ([fg, bg]) => `${fg} on ${bg}: ${ratio(t[fg]!, t[bg]!).toFixed(2)}`,
      );
      expect(failures).toEqual([]);
    });
  }
});
