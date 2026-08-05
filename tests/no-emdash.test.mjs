// Hard rule 1: no em dashes anywhere in code, UI copy, or docs. This test scans
// every project source file so the rule is enforced by CI, not memory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_EXT = new Set(['.mjs', '.js', '.css', '.html', '.md', '.json', '.yaml', '.webmanifest']);
const SKIP_DIRS = new Set(['node_modules', 'data', '.git']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SCAN_EXT.has(extname(name))) yield full;
  }
}

test('no em dashes in any project file', () => {
  const offenders = [];
  for (const file of walk(root)) {
    if (readFileSync(file, 'utf8').includes(String.fromCharCode(0x2014))) offenders.push(file.replace(root + '/', ''));
  }
  assert.deepEqual(offenders, []);
});
