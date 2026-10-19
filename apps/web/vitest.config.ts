import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://tourneasy:tourneasy@localhost:5432/tourneasy_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Service tests share one database; run files one after another.
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 20_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      EMAIL_TRANSPORT: 'memory',
      AUTH_SECRET: 'test-only-secret-at-least-32-characters-long',
      APP_URL: 'https://test.example',
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
