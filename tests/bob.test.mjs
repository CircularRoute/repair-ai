import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, ensureAdminMember, setSetting } from '../lib/db.mjs';
import { saveDocument, getDocuments, getDocument, bobModel, bobChatHistory, DOCUMENT_TYPES } from '../lib/bob.mjs';
import { MODELS } from '../lib/claude.mjs';

function freshDb() {
  const db = openDb({ path: ':memory:' });
  ensureAdminMember(db);
  return db;
}

test('the five living document types match the spec', () => {
  assert.deepEqual(DOCUMENT_TYPES, ['problem-map', 'opportunity-register', 'product-concepts', 'roadmap', 'build-specs']);
});

test('documents version up and old versions are retained (never deleted)', () => {
  const db = freshDb();
  assert.equal(saveDocument(db, 'problem-map', 'v1 content', [1, 2]), 1);
  assert.equal(saveDocument(db, 'problem-map', 'v2 content', [1, 2, 3]), 2);
  const doc = getDocument(db, 'problem-map');
  assert.equal(doc.version, 2);
  assert.equal(doc.content, 'v2 content');
  assert.deepEqual(doc.provenance, [1, 2, 3]);
  assert.equal(doc.versions.length, 2);
  const rows = db.prepare("SELECT COUNT(*) AS c FROM documents WHERE type = 'problem-map'").get().c;
  assert.equal(rows, 2);
});

test('getDocuments lists all five types even before generation', () => {
  const db = freshDb();
  const docs = getDocuments(db);
  assert.equal(docs.length, 5);
  assert.ok(docs.every((d) => d.version === 0));
  saveDocument(db, 'roadmap', 'x', []);
  const after = getDocuments(db);
  assert.equal(after.find((d) => d.type === 'roadmap').version, 1);
});

test('bob model routing: opus default, fable only for deep runs with the toggle', () => {
  const db = freshDb();
  assert.equal(bobModel(db), MODELS.opus);
  assert.equal(bobModel(db, { deep: true }), MODELS.opus);
  setSetting(db, 'bobFable', '1');
  assert.equal(bobModel(db), MODELS.opus, 'chat stays on opus even with the toggle');
  assert.equal(bobModel(db, { deep: true }), MODELS.fable);
});

test('bob chat history stores and orders both sides', () => {
  const db = freshDb();
  db.prepare("INSERT INTO bob_chat (role, content, at) VALUES ('admin', 'q1', '2026-08-05T10:00:00Z')").run();
  db.prepare("INSERT INTO bob_chat (role, content, at) VALUES ('bob', 'a1', '2026-08-05T10:00:05Z')").run();
  const history = bobChatHistory(db);
  assert.equal(history.length, 2);
  assert.equal(history[0].role, 'admin');
  assert.equal(history[1].role, 'bob');
});
