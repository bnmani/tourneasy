import { prisma } from '@tourneasy/db';
import { outbox } from '@/server/email/mailer';
import { signUp } from '@/server/services/auth-service';

/** Empties every table (keeping migrations) and restarts sequences. */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe('ALTER SEQUENCE member_number_seq RESTART WITH 100001');
  outbox.length = 0;
}

export const meta = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130.0' };

let counter = 0;

/** 1 → "a", 27 → "aa": names may not contain digits (letters-only rule, D49). */
function letters(n: number): string {
  let out = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26))
    out = String.fromCharCode(97 + ((i - 1) % 26)) + out;
  return out;
}

/** Signs up a player through the real service; each call uses a fresh email and IP. */
export async function createPlayer(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const input = {
    firstName: 'Test',
    lastName: `Player${letters(counter)}`,
    email: `player${counter}@example.test`,
    phone: '0612345678',
    password: 'Shuttle-Smash-2027',
    dateOfBirth: '1995-04-12',
    gender: 'FEMALE',
    preferredDisciplines: ['DE'],
    locale: 'nl',
    acceptTerms: true,
    acceptPrivacy: true,
    ...overrides,
  };
  const created = await signUp(input, { ...meta, ip: `198.51.100.${counter % 250}` });
  return { ...created, email: input.email as string, password: input.password as string };
}

/** Last email sent to an address, with the first link in it. */
export function lastMailTo(to: string) {
  const mail = [...outbox].reverse().find((m) => m.to === to);
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
  const token = link ? new URL(link).searchParams.get('token') : null;
  return { mail, link, token };
}
