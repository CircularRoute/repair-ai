// SQLite on a persistent disk. Phase 0 creates only the operational tables that the
// auth skeleton and admin shell need; later phases add the corpus tables per spec
// Section 9. Never-delete rule: rows are retired via status flags, not removed.

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (existsSync('/data')) return '/data';
  return join(process.cwd(), 'data');
}

export function openDb({ path } = {}) {
  let dbPath = path;
  if (!dbPath) {
    const dir = resolveDataDir();
    mkdirSync(dir, { recursive: true });
    dbPath = join(dir, 'repair.db');
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'partner')),
      language TEXT NOT NULL DEFAULT 'en',
      status TEXT NOT NULL DEFAULT 'active',
      joinedAt TEXT NOT NULL,
      consentShownAt TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      memberId TEXT NOT NULL REFERENCES members(id),
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    -- Magic links: single-use, expiring. Phase 0 uses them for admin login; the
    -- member invite flow in Phase 1 reuses the same table with purpose 'invite'.
    CREATE TABLE IF NOT EXISTS magic_links (
      token TEXT PRIMARY KEY,
      memberId TEXT NOT NULL REFERENCES members(id),
      purpose TEXT NOT NULL DEFAULT 'login',
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      detail TEXT
    );
  `);
}

export function logEvent(db, kind, detail) {
  db.prepare('INSERT INTO events (at, kind, detail) VALUES (?, ?, ?)').run(
    new Date().toISOString(),
    kind,
    detail ? JSON.stringify(detail) : null
  );
}

// The admin member row is seeded once so sessions have a member to belong to.
export function ensureAdminMember(db, { name = 'Rashad' } = {}) {
  const existing = db
    .prepare("SELECT id FROM members WHERE role = 'admin' LIMIT 1")
    .get();
  if (existing) return existing.id;
  const id = 'admin';
  db.prepare(
    'INSERT INTO members (id, name, role, language, joinedAt) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, 'admin', 'en', new Date().toISOString());
  return id;
}
