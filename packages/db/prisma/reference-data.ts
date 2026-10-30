/**
 * The lists every database needs: age categories and level classes. Safe for production:
 * adds what is missing and never deletes or wipes (unlike seed.ts, which is for development).
 *
 *   DATABASE_URL=<direct url> pnpm --filter @tourneasy/db exec tsx prisma/reference-data.ts
 *
 * Federation values are placeholders until confirmed; see DECISIONS.md D10.
 */
import { PrismaClient } from '@prisma/client';

const t = (nl: string, en: string) => ({ nl, en });

export const AGE_CATEGORIES = [
  { code: 'U11', name: t('Onder 11', 'Under 11'), maxAge: 10, sortOrder: 1 },
  { code: 'U13', name: t('Onder 13', 'Under 13'), maxAge: 12, sortOrder: 2 },
  { code: 'U15', name: t('Onder 15', 'Under 15'), maxAge: 14, sortOrder: 3 },
  { code: 'U17', name: t('Onder 17', 'Under 17'), maxAge: 16, sortOrder: 4 },
  { code: 'U19', name: t('Onder 19', 'Under 19'), maxAge: 18, sortOrder: 5 },
  { code: 'SENIOR', name: t('Senioren', 'Senior'), sortOrder: 6 },
  { code: 'V35', name: t('Veteranen 35+', 'Veterans 35+'), minAge: 35, sortOrder: 7 },
  { code: 'V45', name: t('Veteranen 45+', 'Veterans 45+'), minAge: 45, sortOrder: 8 },
];

export const LEVEL_CLASSES = ['A', 'B', 'C', 'D'].map((code, i) => ({
  code,
  name: t(`Niveau ${code}`, `Level ${code}`),
  rank: i + 1,
}));

async function main() {
  const prisma = new PrismaClient();
  try {
    const ages = await prisma.ageCategory.createMany({
      data: AGE_CATEGORIES,
      skipDuplicates: true,
    });
    const levels = await prisma.levelClass.createMany({
      data: LEVEL_CLASSES,
      skipDuplicates: true,
    });
    console.log(`Age categories added: ${ages.count}; level classes added: ${levels.count}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
