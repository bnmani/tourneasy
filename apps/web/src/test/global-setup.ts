/**
 * Creates the test database (if missing) and applies all migrations before the test run.
 * Uses TEST_DATABASE_URL; never touches the development database.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

export default async function setup() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      'postgresql://tourneasy:tourneasy@localhost:5432/tourneasy_test?schema=public',
  );
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.includes('test')) {
    throw new Error(`Refusing to use "${dbName}" as test database (name must contain "test").`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const exists = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const schema = path.resolve(here, '../../../../packages/db/prisma/schema.prisma');
  const prismaCli = createRequire(schema).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
