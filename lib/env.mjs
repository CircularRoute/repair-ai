// Env loading. Keys live in ONE env file OUTSIDE this folder (parent "Claude
// Playground" folder, greenlight.env by founder ruling 2026-08-05), referenced by
// path only. On Render there is no env file; vars come from the Environment tab.
// Values are never logged, never printed, never committed.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_ENV_FILE = resolve(projectRoot, '..', 'greenlight.env');

// Parse KEY=VALUE lines. Ignores comments, blank lines, and export prefixes.
// Strips one layer of matching quotes. Never throws on malformed lines.
export function parseEnvText(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const unprefixed = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = unprefixed.indexOf('=');
    if (eq <= 0) continue;
    const key = unprefixed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = unprefixed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Loads the env file (ENV_FILE override, else the default path) into process.env.
// Existing process.env values win: Render's Environment tab is authoritative there.
export function loadEnv({ envFile } = {}) {
  const path = envFile || process.env.ENV_FILE || DEFAULT_ENV_FILE;
  let loadedKeys = [];
  if (existsSync(path)) {
    const parsed = parseEnvText(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        loadedKeys.push(key);
      }
    }
  }
  return { path, loadedKeys };
}

// Fails fast with key NAMES only when required vars are missing.
export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(
      'Missing required environment variables: ' +
        missing.join(', ') +
        '. Locally they belong in the parent-folder greenlight.env; on Render, in the Environment tab.'
    );
  }
}
