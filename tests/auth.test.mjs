import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, ensureAdminMember } from '../lib/db.mjs';
import {
  safeEqual,
  createSession,
  getSession,
  retireSession,
  mintMagicLink,
  consumeMagicLink,
  readCookies,
} from '../lib/auth.mjs';

function freshDb() {
  const db = openDb({ path: ':memory:' });
  const adminId = ensureAdminMember(db);
  return { db, adminId };
}

test('safeEqual accepts equal strings, rejects others', () => {
  assert.equal(safeEqual('secret-token', 'secret-token'), true);
  assert.equal(safeEqual('secret-token', 'secret-tokeN'), false);
  assert.equal(safeEqual('short', 'longer-value'), false);
  assert.equal(safeEqual(undefined, 'x'), false);
});

test('admin member is seeded once', () => {
  const { db, adminId } = freshDb();
  assert.equal(ensureAdminMember(db), adminId);
  const count = db.prepare("SELECT COUNT(*) AS c FROM members WHERE role = 'admin'").get().c;
  assert.equal(count, 1);
});

test('session lifecycle: create, read, retire (never delete)', () => {
  const { db, adminId } = freshDb();
  const s = createSession(db, adminId);
  const found = getSession(db, s.id);
  assert.equal(found.memberId, adminId);
  assert.equal(found.role, 'admin');

  retireSession(db, s.id);
  assert.equal(getSession(db, s.id), null);
  const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(s.id);
  assert.equal(row.status, 'retired');
});

test('expired session does not authenticate', () => {
  const { db, adminId } = freshDb();
  const past = new Date('2026-01-01T00:00:00Z');
  const s = createSession(db, adminId, past);
  assert.equal(getSession(db, s.id, new Date('2026-06-01T00:00:00Z')), null);
});

test('magic link is single use', () => {
  const { db, adminId } = freshDb();
  const link = mintMagicLink(db, adminId);
  const first = consumeMagicLink(db, link.token);
  assert.equal(first.memberId, adminId);
  assert.equal(consumeMagicLink(db, link.token), null);
});

test('expired magic link does not authenticate', () => {
  const { db, adminId } = freshDb();
  const mintedAt = new Date('2026-08-05T00:00:00Z');
  const link = mintMagicLink(db, adminId, 'login', mintedAt);
  assert.equal(consumeMagicLink(db, link.token, new Date('2026-08-05T01:00:00Z')), null);
});

test('unknown magic link does not authenticate', () => {
  const { db } = freshDb();
  assert.equal(consumeMagicLink(db, 'nope'), null);
});

test('readCookies parses a cookie header', () => {
  const out = readCookies('a=1; repair_session=abc; b=2');
  assert.equal(out.repair_session, 'abc');
});
