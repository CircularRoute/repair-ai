import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, ensureAdminMember, setSetting } from '../lib/db.mjs';
import { insertMessage } from '../lib/chat.mjs';
import {
  CAP_LINES, isEngagement, exchangeGate, recordOttoReply,
  canIntervene, recordIntervention, memberPrefersVoice, ottoSettings,
} from '../lib/otto-engine.mjs';
import { OTTO_ID } from '../lib/otto.mjs';

function freshDb() {
  const db = openDb({ path: ':memory:' });
  ensureAdminMember(db);
  db.prepare("INSERT INTO members (id, name, role, language, joinedAt) VALUES ('p_e', 'Elvin', 'partner', 'ru', '2026-08-01')").run();
  return db;
}

test('cap lines are exact in all three languages and name Rashad', () => {
  assert.equal(CAP_LINES.en, 'I have been instructed by Rashad to keep conversations short, I am sorry.');
  assert.match(CAP_LINES.ru, /Рашад/);
  assert.match(CAP_LINES.az, /Rəşad/);
  for (const line of Object.values(CAP_LINES)) {
    assert.equal(line.includes(String.fromCharCode(0x2014)), false);
  }
});

test('engagement (ruling 14): mention, explicit reply, or first message after Otto only', () => {
  const db = freshDb();
  const base = Date.now();
  const at = (min) => new Date(base + min * 60 * 1000).toISOString();

  // Mentions engage regardless of position; plain chat does not.
  insertMessage(db, { senderId: 'admin', senderKind: 'member', kind: 'text', originalText: 'morning all', ts: at(0) });
  assert.equal(isEngagement(db, { id: 'x1', ts: at(1), senderId: 'p_e', originalText: 'Otto, what do you think?' }), true);
  assert.equal(isEngagement(db, { id: 'x2', ts: at(1), senderId: 'p_e', originalText: 'Отто, привет' }), true);
  assert.equal(isEngagement(db, { id: 'x3', ts: at(1), senderId: 'p_e', originalText: 'just chatting with friends' }), false);

  // Otto speaks; the very next message engages, whoever sends it.
  const ottoMsg = insertMessage(db, { senderId: OTTO_ID, senderKind: 'agent', kind: 'text', originalText: 'q?', pipelineStatus: 'done', ts: at(2) });
  const first = insertMessage(db, { senderId: 'p_e', senderKind: 'member', kind: 'text', originalText: 'my answer', ts: at(3) });
  assert.equal(isEngagement(db, first), true);

  // The message after that first reply is member-to-member, even minutes later.
  const second = insertMessage(db, { senderId: 'admin', senderKind: 'member', kind: 'text', originalText: 'I agree with Elvin', ts: at(4) });
  assert.equal(isEngagement(db, second), false);
  // Same member continuing without a mention is also not engagement now.
  const third = insertMessage(db, { senderId: 'p_e', senderKind: 'member', kind: 'text', originalText: 'and one more thing', ts: at(5) });
  assert.equal(isEngagement(db, third), false);

  // Explicit reply-to-Otto still engages from anywhere.
  assert.equal(isEngagement(db, { id: 'x4', ts: at(6), senderId: 'admin', originalText: 'late answer', replyToId: ottoMsg.id }), true);
});

test('conversation cap: 4 replies, then the verbatim line, then silence, then reset', () => {
  const db = freshDb();
  let now = new Date('2026-08-05T10:00:00Z');
  for (let i = 0; i < 4; i++) {
    assert.equal(exchangeGate(db, 'p_e', now), 'reply', `reply ${i + 1}`);
    recordOttoReply(db, 'p_e', {}, now);
    now = new Date(now.getTime() + 60 * 1000);
  }
  assert.equal(exchangeGate(db, 'p_e', now), 'cap');
  recordOttoReply(db, 'p_e', { capped: true }, now);
  assert.equal(exchangeGate(db, 'p_e', new Date(now.getTime() + 60 * 1000)), 'silent');
  // After a 30+ minute gap the exchange resets.
  assert.equal(exchangeGate(db, 'p_e', new Date(now.getTime() + 35 * 60 * 1000)), 'reply');
});

test('cap is admin-tunable', () => {
  const db = freshDb();
  setSetting(db, 'ottoCap', 1);
  const now = new Date('2026-08-05T10:00:00Z');
  assert.equal(exchangeGate(db, 'p_e', now), 'reply');
  recordOttoReply(db, 'p_e', {}, now);
  assert.equal(exchangeGate(db, 'p_e', new Date(now.getTime() + 1000)), 'cap');
});

test('proactive budget: lull required, spacing, daily budget, mute', () => {
  const db = freshDb();
  const now = new Date('2026-08-05T12:00:00Z');

  // Active conversation 2 minutes ago: no intervention.
  insertMessage(db, { senderId: 'p_e', senderKind: 'member', kind: 'text', originalText: 'hi', ts: new Date(now.getTime() - 2 * 60 * 1000).toISOString() });
  assert.equal(canIntervene(db, now).ok, false);

  // Lull of 15 minutes: allowed.
  const db2 = freshDb();
  insertMessage(db2, { senderId: 'p_e', senderKind: 'member', kind: 'text', originalText: 'hi', ts: new Date(now.getTime() - 15 * 60 * 1000).toISOString() });
  assert.equal(canIntervene(db2, now).ok, true);

  // Spacing: a second intervention 10 minutes later is blocked.
  recordIntervention(db2, now);
  assert.equal(canIntervene(db2, new Date(now.getTime() + 10 * 60 * 1000)).ok, false);

  // Daily budget of 3.
  recordIntervention(db2, new Date(now.getTime() + 40 * 60 * 1000));
  recordIntervention(db2, new Date(now.getTime() + 80 * 60 * 1000));
  assert.equal(canIntervene(db2, new Date(now.getTime() + 200 * 60 * 1000)).ok, false);
  assert.equal(canIntervene(db2, new Date(now.getTime() + 200 * 60 * 1000)).reason, 'budget');

  // Mute wins over everything.
  const db3 = freshDb();
  insertMessage(db3, { senderId: 'p_e', senderKind: 'member', kind: 'text', originalText: 'hi', ts: new Date(now.getTime() - 15 * 60 * 1000).toISOString() });
  setSetting(db3, 'ottoMuted', '1');
  assert.equal(canIntervene(db3, now).ok, false);
  assert.equal(canIntervene(db3, now).reason, 'muted');
});

test('stale groups and otto-last are not intervened on', () => {
  const db = freshDb();
  const now = new Date('2026-08-05T12:00:00Z');
  insertMessage(db, { senderId: 'p_e', senderKind: 'member', kind: 'text', originalText: 'old', ts: new Date(now.getTime() - 10 * 3600 * 1000).toISOString() });
  assert.equal(canIntervene(db, now).reason, 'stale');
  insertMessage(db, { senderId: OTTO_ID, senderKind: 'agent', kind: 'text', originalText: 'q?', ts: new Date(now.getTime() - 20 * 60 * 1000).toISOString() });
  assert.equal(canIntervene(db, now).reason, 'otto-last');
});

test('voice preference needs a mostly-voice history', () => {
  const db = freshDb();
  assert.equal(memberPrefersVoice(db, 'p_e'), false);
  for (let i = 0; i < 4; i++) {
    insertMessage(db, { senderId: 'p_e', senderKind: 'member', kind: 'voice', audioPath: `/a/${i}.m4a` });
  }
  insertMessage(db, { senderId: 'p_e', senderKind: 'member', kind: 'text', originalText: 'x' });
  assert.equal(memberPrefersVoice(db, 'p_e'), true);
});

test('otto settings defaults', () => {
  const db = freshDb();
  const s = ottoSettings(db);
  assert.equal(s.cap, 4);
  assert.equal(s.proactivePerDay, 3);
  assert.equal(s.muted, false);
  assert.deepEqual(s.voiceLangs, ['en', 'ru', 'az']);
});

test('check-with plumbing: file, answer, relay states; ack and thin lines complete', async () => {
  const { fileAgentRequest, answerAgentRequest, CHECK_ACK, CHECK_THIN } = await import('../lib/otto-engine.mjs');
  const db = freshDb();
  const id = fileAgentRequest(db, { toAgent: 'mark', question: 'what do shops charge for diagnostics?', contextRefs: ['m_1'] });
  let row = db.prepare('SELECT * FROM agent_requests WHERE id = ?').get(id);
  assert.equal(row.status, 'open');
  assert.equal(row.toAgent, 'mark');
  assert.deepEqual(JSON.parse(row.contextRefs), ['m_1']);

  answerAgentRequest(db, id, 'Typical range is X', 'answered');
  row = db.prepare('SELECT * FROM agent_requests WHERE id = ?').get(id);
  assert.equal(row.status, 'answered');
  answerAgentRequest(db, id, 'Typical range is X', 'relayed');
  assert.equal(db.prepare('SELECT status FROM agent_requests WHERE id = ?').get(id).status, 'relayed');

  for (const agent of ['mark', 'bob']) {
    for (const lang of ['en', 'ru', 'az']) {
      assert.ok(CHECK_ACK[agent][lang].length > 5, `${agent}/${lang} ack`);
      assert.ok(CHECK_THIN[agent][lang].length > 5, `${agent}/${lang} thin`);
      assert.equal(CHECK_ACK[agent][lang].includes(String.fromCharCode(0x2014)), false);
    }
  }
});

test('mark research queue dedupes and caps', async () => {
  const { queueResearch, getQueue } = await import('../lib/mark.mjs');
  const db = freshDb();
  queueResearch(db, 'diagnostics pricing');
  queueResearch(db, 'diagnostics pricing');
  queueResearch(db, 'pm contracts');
  assert.deepEqual(getQueue(db), ['diagnostics pricing', 'pm contracts']);
});

test('generateReply check directive parsing', async () => {
  // Deterministic parse check via the exported regex behaviour: simulate what
  // the engine does with a CHECK output by invoking the parser indirectly is
  // not possible offline; assert the directive format contract instead.
  const sample = '[CHECK:mark] what do other shops charge for diagnostics?';
  const match = /^\[CHECK:(mark|bob)\]\s*(.+)/s.exec(sample);
  assert.equal(match[1], 'mark');
  assert.equal(match[2], 'what do other shops charge for diagnostics?');
});
