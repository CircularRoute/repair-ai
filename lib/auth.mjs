// Magic-link auth skeleton (proven pattern from the parent org). Phase 0 flow:
// the founder exchanges REPAIR_ADMIN_TOKEN once at /login for a session cookie, and
// can mint single-use magic links for future logins from other devices. Phase 1
// reuses mintMagicLink with purpose 'invite' for member invite links.

import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'repair_session';
const SESSION_DAYS = 90;
const MAGIC_LINK_MINUTES = 30;

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

export function mintMagicLink(db, memberId, purpose = 'login', now = new Date()) {
  const token = newToken();
  const expires = new Date(now.getTime() + MAGIC_LINK_MINUTES * 60 * 1000);
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
