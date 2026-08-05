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
