// Completes the standalone build: Next.js leaves static assets out of .next/standalone,
// expecting a CDN. We serve them from the same server, so copy them next to server.js.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// Inside standalone the app keeps its path relative to the monorepo root.
const appDir = join(webDir, '.next/standalone/apps/web');

if (!existsSync(join(appDir, 'server.js'))) {
  console.error(`prepare-standalone: ${appDir}/server.js not found — is output: 'standalone' set?`);
  process.exit(1);
}

cpSync(join(webDir, '.next/static'), join(appDir, '.next/static'), { recursive: true });
if (existsSync(join(webDir, 'public'))) {
  cpSync(join(webDir, 'public'), join(appDir, 'public'), { recursive: true });
}

console.log('prepare-standalone: static assets copied to', appDir);
