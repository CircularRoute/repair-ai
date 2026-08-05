// Magic-link auth skeleton (proven pattern from the parent org). Phase 0 flow:
// the founder exchanges REPAIR_ADMIN_TOKEN once at /login for a session cookie, and
// can mint single-use magic links for future logins from other devices. Phase 1
// reuses mintMagicLink with purpose 'invite' for member invite links.

import { randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';

export const SESSION_COOKIE = 'repair_session';
// Members stay signed in until they sign out (ruling 13); a year in practice.
const SESSION_DAYS = 365;
const MAGIC_LINK_MINUTES = 30;
const LOGIN_CODE_MINUTES = 15;
const LOGIN_CODE_MAX_ATTEMPTS = 5;

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

// Constant-time comparison so the admin token cannot be probed byte by byte.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSession(db, memberId, now = new Date()) {
  const id = newToken();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000);
  db.prepare(
    'INSERT INTO sessions (id, memberId, createdAt, expiresAt) VALUES (?, ?, ?, ?)'
  ).run(id, memberId, now.toISOString(), expires.toISOString());
  return { id, expiresAt: expires };
}

export function getSession(db, sessionId, now = new Date()) {
  if (!sessionId) return null;
  const row = db
    .prepare(
      `SELECT s.id, s.memberId, s.expiresAt, s.status, m.role, m.name
       FROM sessions s JOIN members m ON m.id = s.memberId
       WHERE s.id = ?`
    )
    .get(sessionId);
  if (!row) return null;
  if (row.status !== 'active') return null;
  if (new Date(row.expiresAt) <= now) return null;
  return row;
}

// Never-delete rule: logout retires the session, it does not remove the row.
export function retireSession(db, sessionId) {
  db.prepare("UPDATE sessions SET status = 'retired' WHERE id = ?").run(sessionId);
}

export function mintMagicLink(db, memberId, purpose = 'login', now = new Date(), minutes = MAGIC_LINK_MINUTES) {
  const token = newToken();
  const expires = new Date(now.getTime() + minutes * 60 * 1000);
  db.prepare(
    'INSERT INTO magic_links (token, memberId, purpose, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?)'
  ).run(token, memberId, purpose, now.toISOString(), expires.toISOString());
  return { token, expiresAt: expires };
}

// Single use: consuming marks usedAt; a used or expired token never authenticates.
export function consumeMagicLink(db, token, now = new Date()) {
  if (!token) return null;
  const row = db
    .prepare('SELECT token, memberId, purpose, expiresAt, usedAt FROM magic_links WHERE token = ?')
    .get(token);
  if (!row) return null;
  if (row.usedAt) return null;
  if (new Date(row.expiresAt) <= now) return null;
  db.prepare('UPDATE magic_links SET usedAt = ? WHERE token = ?').run(
    now.toISOString(),
    token
  );
  return { memberId: row.memberId, purpose: row.purpose };
}

// --- Email sign-in codes (ruling 13) ---

function hashCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

export function mintLoginCode(db, memberId, now = new Date()) {
  const code = String(randomInt(100000, 1000000));
  const expires = new Date(now.getTime() + LOGIN_CODE_MINUTES * 60 * 1000);
  db.prepare(
    'INSERT INTO login_codes (memberId, codeHash, createdAt, expiresAt) VALUES (?, ?, ?, ?)'
  ).run(memberId, hashCode(code), now.toISOString(), expires.toISOString());
  return { code, expiresAt: expires };
}

// Single use, expiring, attempt-limited. Wrong attempts count against the most
// recent live code so it cannot be brute forced.
export function consumeLoginCode(db, memberId, code, now = new Date()) {
  const row = db
    .prepare(
      `SELECT * FROM login_codes WHERE memberId = ? AND usedAt IS NULL
       ORDER BY createdAt DESC LIMIT 1`
    )
    .get(memberId);
  if (!row) return false;
  if (new Date(row.expiresAt) <= now) return false;
  if (row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) return false;
  if (!safeEqual(hashCode(code), row.codeHash)) {
    db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return false;
  }
  db.prepare('UPDATE login_codes SET usedAt = ? WHERE id = ?').run(now.toISOString(), row.id);
  return true;
}

export function sessionCookieHeader(sessionId, expiresAt, { secure = true } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader({ secure = true } = {}) {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}
