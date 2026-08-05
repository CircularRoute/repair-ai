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
  if (!memberCols.includes('voicePref')) {
    // Ruling 23: how Otto's replies reach this member. 'auto' = the rationing
    // heuristic, 'always' = every reply as a voice note, 'never' = text only.
    db.exec("ALTER TABLE members ADD COLUMN voicePref TEXT DEFAULT 'auto'");
  }
  const messageCols = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
  if (!messageCols.includes('deletedAt')) {
    // WhatsApp-style deletion (ruling 12): status becomes 'deleted', content is
    // retained for the admin corpus but excluded from chat and agent retrieval.
    db.exec('ALTER TABLE messages ADD COLUMN deletedAt TEXT');
  }
  if (!memberCols.includes('email')) {
    // Email allowlist sign-in (ruling 13).
    db.exec('ALTER TABLE members ADD COLUMN email TEXT');
  }
  db.exec(`
    -- 6-digit sign-in codes emailed via Brevo (ruling 13). Codes are stored
    -- hashed, single use, expiring, with an attempt counter.
    CREATE TABLE IF NOT EXISTS login_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memberId TEXT NOT NULL,
      codeHash TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    -- Phase 2: corpus intelligence (spec Sections 4 and 9).
    CREATE TABLE IF NOT EXISTS tags (
      messageId TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'classifier' CHECK (source IN ('classifier', 'admin', 'bob')),
      PRIMARY KEY (messageId, tag)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      messageId TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_message ON chunks (messageId);

    -- Atomic findings Bob reasons over; messages are the evidence behind them.
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      tag TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      sourceMessageIds TEXT NOT NULL,
      extractedAt TEXT NOT NULL,
      embedding BLOB
    );

    -- Phase 4: Bob's living documents, versioned, provenance-linked (spec 6/9).
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      provenance TEXT NOT NULL DEFAULT '[]',
      createdBy TEXT NOT NULL DEFAULT 'bob',
      at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (type, version);

    -- Bob's real-time chat with the admin (dashboard only). Legacy table kept
    -- (never delete); agent_chat below supersedes it.
    CREATE TABLE IF NOT EXISTS bob_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'bob')),
      content TEXT NOT NULL,
      at TEXT NOT NULL
    );

    -- Admin chats with the agents (dashboard only).
    CREATE TABLE IF NOT EXISTS agent_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT NOT NULL CHECK (agent IN ('bob', 'mark', 'otto')),
      role TEXT NOT NULL CHECK (role IN ('admin', 'agent')),
      content TEXT NOT NULL,
      at TEXT NOT NULL
    );

    -- Phase 5: the check-with protocol queue (spec Section 7b).
    CREATE TABLE IF NOT EXISTS agent_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fromAgent TEXT NOT NULL,
      toAgent TEXT NOT NULL,
      question TEXT NOT NULL,
      contextRefs TEXT NOT NULL DEFAULT '[]',
      answer TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'relayed', 'declined')),
      askedAt TEXT NOT NULL,
      answeredAt TEXT
    );

    -- Phase 6: admin tool registry (spec Sections 8/9). configRef holds env
    -- var NAMES only, never secrets.
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'http-api',
      description TEXT NOT NULL,
      baseUrl TEXT NOT NULL,
      authType TEXT NOT NULL DEFAULT 'none' CHECK (authType IN ('none', 'bearer', 'header', 'query')),
      authEnvVar TEXT,
      authParamName TEXT,
      addedBy TEXT NOT NULL DEFAULT 'admin',
      at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    -- Phase 6: admin-uploaded knowledge (docs, notes, links), chunked and
    -- embedded into the shared corpus like everything else.
    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('file', 'note', 'link')),
      path TEXT,
      url TEXT,
      addedAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS taxonomy_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL,
      proposedBy TEXT NOT NULL,
      evidence TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      proposedAt TEXT NOT NULL
    );
  `);

  // Widen agent_chat to include Otto (table rebuild; SQLite cannot alter a
  // CHECK constraint in place). Data is copied, nothing lost.
  const chatSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_chat'").get()?.sql || '';
  if (chatSql && !chatSql.includes("'otto'")) {
    db.exec(`
      ALTER TABLE agent_chat RENAME TO agent_chat_migrating;
      CREATE TABLE agent_chat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL CHECK (agent IN ('bob', 'mark', 'otto')),
        role TEXT NOT NULL CHECK (role IN ('admin', 'agent')),
        content TEXT NOT NULL,
        at TEXT NOT NULL
      );
      INSERT INTO agent_chat (id, agent, role, content, at)
        SELECT id, agent, role, content, at FROM agent_chat_migrating;
      DROP TABLE agent_chat_migrating;
    `);
  }

  // One-time carry-over of the legacy Bob chat into agent_chat (runs after all
  // tables exist).
  const agentChatEmpty = db.prepare('SELECT COUNT(*) AS c FROM agent_chat').get().c === 0;
  if (agentChatEmpty && db.prepare('SELECT COUNT(*) AS c FROM bob_chat').get().c > 0) {
    db.exec("INSERT INTO agent_chat (agent, role, content, at) SELECT 'bob', CASE role WHEN 'admin' THEN 'admin' ELSE 'agent' END, content, at FROM bob_chat");
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
// The founder is trilingual; the admin profile carries all three languages so
// the reinforced AZ voice path applies to the founder's own notes.
export function ensureAdminMember(db, { name = 'Rashad' } = {}) {
  const existing = db
    .prepare("SELECT id, languages FROM members WHERE role = 'admin' LIMIT 1")
    .get();
  if (existing) {
    if (!existing.languages) {
      db.prepare("UPDATE members SET languages = 'en,ru,az' WHERE id = ?").run(existing.id);
    }
    return existing.id;
  }
  const id = 'admin';
  db.prepare(
    "INSERT INTO members (id, name, role, language, languages, joinedAt) VALUES (?, ?, 'admin', 'en', 'en,ru,az', ?)"
  ).run(id, name, new Date().toISOString());
  return id;
}
