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

    -- Group chat messages. senderId is a member id, an agent id ('otto-r'), or
    -- 'system' for system notices; senderKind disambiguates, so no FK on senderId.
    -- Never-delete rule: messages are never removed; status 'retired' hides only.
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      senderId TEXT NOT NULL,
      senderKind TEXT NOT NULL CHECK (senderKind IN ('member', 'agent', 'system')),
      ts TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('text', 'voice', 'file')),
      originalText TEXT,
      audioPath TEXT,
      filePath TEXT,
      fileName TEXT,
      fileMime TEXT,
      fileSize INTEGER,
      transcript TEXT,
      transcriptAlt TEXT,
      transcriptConfidence REAL,
      language TEXT,
      englishText TEXT,
      replyToId TEXT,
      pipelineStatus TEXT NOT NULL DEFAULT 'pending',
      pipelineError TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages (ts);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      memberId TEXT NOT NULL,
      subscription TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS spend (
      day TEXT NOT NULL,
      agent TEXT NOT NULL,
      model TEXT NOT NULL,
      inputTokens INTEGER NOT NULL DEFAULT 0,
      outputTokens INTEGER NOT NULL DEFAULT 0,
      usd REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (day, agent, model)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Per-member glossary built from admin transcript corrections (AZ path).
    CREATE TABLE IF NOT EXISTS glossary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memberId TEXT NOT NULL,
      wrong TEXT NOT NULL,
      right TEXT NOT NULL,
      addedAt TEXT NOT NULL
    );
  `);

  // Additive column migrations (SQLite has no IF NOT EXISTS for columns).
  const memberCols = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
  if (!memberCols.includes('languages')) {
    // CSV of all languages the member uses, main language first. The legacy
    // `language` column keeps the main language for existing rows and code.
    db.exec('ALTER TABLE members ADD COLUMN languages TEXT');
  }
  const messageCols = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
  if (!messageCols.includes('deletedAt')) {
    // WhatsApp-style deletion (ruling 12): status becomes 'deleted', content is
    // retained for the admin corpus but excluded from chat and agent retrieval.
    db.exec('ALTER TABLE messages ADD COLUMN deletedAt TEXT');
  }
}

// All languages a member uses, main first. Falls back to the single-language
// column for rows created before the multi-language ruling.
export function memberLanguages(member) {
  const raw = member?.languages || member?.language || 'en';
  const list = raw.split(',').map((s) => s.trim()).filter((l) => ['en', 'ru', 'az'].includes(l));
  return list.length ? [...new Set(list)] : ['en'];
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(db, key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
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
