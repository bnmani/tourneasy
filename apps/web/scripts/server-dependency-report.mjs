// Read-only check that runs at the end of the build on Hostinger only (temporary, Oct 2026).
// Hostinger's vulnerability scanner reports old package versions (vitest 2.1.9, vite 5.4.21, …)
// that the project no longer uses. This prints where copies of those packages sit in the
// hosting account, so the stale ones can be removed. It never changes anything and never
// fails the build.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

const home = homedir();
// Hostinger account homes look like /home/u123456789; skip on every other machine.
if (!/^\/home\/u\d+$/.test(home)) process.exit(0);

const TARGETS = new Set([
  'vitest',
  '@vitest/mocker',
  'vite',
  'tinypool',
  'esbuild',
  'postcss',
  'deepmerge-ts',
]);
const MAX_DEPTH = 16;
const MAX_ENTRIES = 600_000;
const deadline = Date.now() + 25_000;

const found = new Map(); // "name@version" → paths
let visited = 0;
let storeHits = 0;

function record(name, version, path) {
  const key = `${name}@${version}`;
  if (!found.has(key)) found.set(key, []);
  const list = found.get(key);
  if (list.length < 6) list.push(relative(home, path) || '.');
}

function walk(dir, depth) {
  if (depth > MAX_DEPTH || visited > MAX_ENTRIES || Date.now() > deadline) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    visited += 1;
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    // pnpm's content-addressed store: count index entries for the flagged versions only.
    if (path.endsWith(join('.local', 'share', 'pnpm', 'store'))) {
      scanStore(path, 0);
      continue;
    }
    const parentIsModules =
      dir.endsWith('node_modules') || dir.endsWith(join('node_modules', '@vitest'));
    const name = dir.endsWith('@vitest') ? `@vitest/${entry.name}` : entry.name;
    if (parentIsModules && TARGETS.has(name)) {
      try {
        const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
        record(name, pkg.version, path);
      } catch {
        // not a package directory
      }
    }
    walk(path, depth + 1);
  }
}

function scanStore(dir, depth) {
  if (depth > 6 || Date.now() > deadline) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) scanStore(join(dir, entry.name), depth + 1);
    else if (/(vitest|tinypool|vite)@(2\.1\.9|1\.1\.1|5\.4\.21)/.test(entry.name)) storeHits += 1;
  }
}

try {
  console.log(`[server-check] scanning ${home} for flagged packages…`);
  walk(home, 0);
  for (const [key, paths] of [...found.entries()].sort()) {
    console.log(`[server-check] ${key}`);
    for (const p of paths) console.log(`[server-check]    ${p}`);
  }
  const store = join(home, '.local', 'share', 'pnpm', 'store');
  console.log(
    `[server-check] pnpm store ${existsSync(store) ? 'present' : 'absent'}; index entries for old vitest/vite/tinypool: ${storeHits}`,
  );
  console.log(
    `[server-check] done (${visited} entries${Date.now() > deadline ? ', time limit hit' : ''})`,
  );
} catch (error) {
  console.log(`[server-check] skipped: ${error instanceof Error ? error.message : error}`);
}
