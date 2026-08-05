import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, ensureAdminMember } from '../lib/db.mjs';
import { mintMagicLink, consumeMagicLink } from '../lib/auth.mjs';
import { insertMessage, messageView } from '../lib/chat.mjs';

function freshDb() {
  const db = openDb({ path: ':memory:' });
  ensureAdminMember(db);
  return db;
}

test('invite links honor a custom expiry and are single use', () => {
  const db = freshDb();
  db.prepare("INSERT INTO members (id, name, role, language, joinedAt) VALUES ('p_1', 'Elvin', 'partner', 'az', ?)")
    .run(new Date().toISOString());
  const minted = new Date('2026-08-05T00:00:00Z');
  const link = mintMagicLink(db, 'p_1', 'invite', minted, 7 * 24 * 60);
  // Still valid after 6 days
  const ok = consumeMagicLink(db, link.token, new Date('2026-08-11T00:00:00Z'));
  assert.equal(ok.memberId, 'p_1');
  assert.equal(ok.purpose, 'invite');
  assert.equal(consumeMagicLink(db, link.token, new Date('2026-08-11T00:01:00Z')), null);
});

test('expired invite does not authenticate', () => {
  const db = freshDb();
  db.prepare("INSERT INTO members (id, name, role, language, joinedAt) VALUES ('p_2', 'Anar', 'partner', 'ru', ?)")
    .run(new Date().toISOString());
  const link = mintMagicLink(db, 'p_2', 'invite', new Date('2026-08-05T00:00:00Z'), 7 * 24 * 60);
  assert.equal(consumeMagicLink(db, link.token, new Date('2026-08-13T00:00:01Z')), null);
});

test('messages store and render for member, agent, and system senders', () => {
  const db = freshDb();
  const m1 = insertMessage(db, { senderId: 'admin', senderKind: 'member', kind: 'text', originalText: 'hello' });
  const m2 = insertMessage(db, { senderId: 'otto-r', senderKind: 'agent', kind: 'text', originalText: 'welcome', pipelineStatus: 'done' });
  const m3 = insertMessage(db, { senderId: 'system', senderKind: 'system', kind: 'text', originalText: 'notice', pipelineStatus: 'done' });

  assert.equal(messageView(db, m1).senderName, 'Rashad');
  assert.equal(messageView(db, m2).senderName, 'Otto');
  assert.equal(messageView(db, m3).senderName, 'System');
  assert.equal(messageView(db, m1).text, 'hello');
  const count = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  assert.equal(count, 3);
});

test('voice message view exposes audio without pipeline internals', () => {
  const db = freshDb();
  const m = insertMessage(db, { senderId: 'admin', senderKind: 'member', kind: 'voice', audioPath: '/data/audio/x.webm' });
  const view = messageView(db, m);
  assert.equal(view.hasAudio, true);
  assert.equal(view.kind, 'voice');
  assert.equal('audioPath' in view, false);
  assert.equal('pipelineStatus' in view, false);
});

test('memberLanguages parses CSV, dedupes, falls back to legacy column', async () => {
  const { memberLanguages } = await import('../lib/db.mjs');
  assert.deepEqual(memberLanguages({ languages: 'az,ru' }), ['az', 'ru']);
  assert.deepEqual(memberLanguages({ languages: 'ru,ru,xx' }), ['ru']);
  assert.deepEqual(memberLanguages({ language: 'az' }), ['az']);
  assert.deepEqual(memberLanguages({}), ['en']);
  assert.deepEqual(memberLanguages(null), ['en']);
});

test('retiring a member kills their sessions and unused invites, keeps messages', async () => {
  const { createSession, getSession } = await import('../lib/auth.mjs');
  const db = freshDb();
  db.prepare("INSERT INTO members (id, name, role, language, joinedAt) VALUES ('p_r', 'Temp', 'partner', 'en', ?)")
    .run(new Date().toISOString());
  const s = createSession(db, 'p_r');
  const link = mintMagicLink(db, 'p_r', 'invite');
  insertMessage(db, { senderId: 'p_r', senderKind: 'member', kind: 'text', originalText: 'kept' });

  const now = new Date().toISOString();
  db.prepare("UPDATE members SET status = 'retired' WHERE id = 'p_r'").run();
  db.prepare("UPDATE sessions SET status = 'retired' WHERE memberId = 'p_r'").run();
  db.prepare("UPDATE magic_links SET usedAt = ? WHERE memberId = 'p_r' AND usedAt IS NULL").run(now);

  assert.equal(getSession(db, s.id), null);
  assert.equal(consumeMagicLink(db, link.token), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM messages WHERE senderId = 'p_r'").get().c, 1);
  assert.equal(db.prepare("SELECT status FROM members WHERE id = 'p_r'").get().status, 'retired');
});

test('deleted messages render as placeholder and hide content and media', () => {
  const db = freshDb();
  const m = insertMessage(db, { senderId: 'admin', senderKind: 'member', kind: 'voice', audioPath: '/data/audio/x.m4a' });
  db.prepare("UPDATE messages SET status = 'deleted', deletedAt = ? WHERE id = ?").run(new Date().toISOString(), m.id);
  const view = messageView(db, db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id));
  assert.equal(view.deleted, true);
  assert.equal(view.text, null);
  assert.equal(view.hasAudio, false);
  // Content is retained in the database (never-delete rule).
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id);
  assert.equal(row.audioPath, '/data/audio/x.m4a');
});

test('login email templates exist per language with code and link', async () => {
  const { sendLoginCode } = await import('../lib/email.mjs');
  for (const language of ['en', 'ru', 'az']) {
    let captured = null;
    await sendLoginCode(
      { to: 'x@y.z', name: 'X', language, code: '123456', url: 'https://otto.repairnow.app/signin/t' },
      async (payload) => { captured = payload; return true; }
    );
    assert.ok(captured.subject.includes('123456'), language);
    assert.ok(captured.text.includes('123456'), language);
    assert.ok(captured.text.includes('https://otto.repairnow.app/signin/t'), language);
    assert.equal(captured.text.includes(String.fromCharCode(0x2014)), false, language);
  }
});
