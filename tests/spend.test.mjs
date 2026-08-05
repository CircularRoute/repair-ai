import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.mjs';
import {
  costUsd, recordSpend, spentToday, isBlocked, unblock, canSpend,
  getCeiling, setCeiling, ceilingNoticeText, DEFAULT_CEILING_USD,
} from '../lib/spend.mjs';

test('cost math matches the price table', () => {
  assert.equal(costUsd('claude-haiku-4-5', 1_000_000, 0), 1.0);
  assert.equal(costUsd('claude-opus-5', 1_000_000, 1_000_000), 30.0);
  assert.equal(costUsd('unknown-model', 1_000_000, 1_000_000), 0);
});

test('ceiling defaults to $30 and is tunable', () => {
  const db = openDb({ path: ':memory:' });
  assert.equal(getCeiling(db), DEFAULT_CEILING_USD);
  assert.equal(DEFAULT_CEILING_USD, 30);
  setCeiling(db, 35);
  assert.equal(getCeiling(db), 35);
});

test('recording accumulates and trips the block exactly once', () => {
  const db = openDb({ path: ':memory:' });
  setCeiling(db, 1);
  let blocks = 0;
  const onBlock = () => blocks++;

  recordSpend(db, { agent: 'otto', model: 'claude-sonnet-5', usd: 0.4 }, onBlock);
  assert.equal(isBlocked(db), false);
  recordSpend(db, { agent: 'bob', model: 'claude-opus-5', usd: 0.7 }, onBlock);
  assert.equal(isBlocked(db), true);
  assert.equal(blocks, 1);
  // Further spend (capture-side keeps running) must not re-fire the notice.
  recordSpend(db, { agent: 'pipeline', model: 'claude-haiku-4-5', usd: 0.1 }, onBlock);
  assert.equal(blocks, 1);
  assert.ok(spentToday(db) > 1);
});

test('block gates agent work but never capture, and only unblock lifts it', () => {
  const db = openDb({ path: ':memory:' });
  setCeiling(db, 0.5);
  recordSpend(db, { agent: 'otto', model: 'claude-sonnet-5', usd: 1 }, null);
  assert.equal(canSpend(db), false);
  assert.equal(canSpend(db, { capture: true }), true);
  unblock(db);
  assert.equal(canSpend(db), true);
});

test('ceiling notice is trilingual and names Rashad', () => {
  const text = ceilingNoticeText();
  assert.match(text, /Rashad/);
  assert.equal(text.split('\n').length, 3);
  assert.equal(text.includes(String.fromCharCode(0x2014)), false);
});
