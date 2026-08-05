// Spend metering and the daily cost ceiling (founder ruling 2026-08-05, decisions.md
// ruling 10). Default ceiling $20/day, admin-tunable. At the ceiling: agents pause, a
// system notice is posted in the group chat (EN/RU/AZ), the admin gets a push, and
// only the admin can unblock from the dashboard. Raw capture never stops; incoming
// transcription and embedding continue by default and still count toward the ceiling.

import { getSetting, setSetting, logEvent } from './db.mjs';

export const DEFAULT_CEILING_USD = 20;

// USD per million tokens. Claude prices confirmed 2026-08-05 (Anthropic API docs).
// OpenAI entries are estimates for the metering layer; verify against OpenAI pricing.
export const PRICES = {
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-sonnet-5': { in: 3.0, out: 15.0 },
  'claude-opus-5': { in: 5.0, out: 25.0 },
  'claude-fable-5': { in: 10.0, out: 50.0 },
  'text-embedding-3-large': { in: 0.13, out: 0 },
  'gpt-4o-audio-preview': { in: 40.0, out: 20.0 },
};

// Per-minute audio prices (transcription and TTS are simpler to meter by duration).
export const AUDIO_PRICES_PER_MIN = {
  'gpt-4o-transcribe': 0.006,
  'whisper-1': 0.006,
  'gpt-4o-mini-tts': 0.015,
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function costUsd(model, inputTokens, outputTokens) {
  const p = PRICES[model];
  if (!p) return 0;
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

export function getCeiling(db) {
  return Number(getSetting(db, 'spendCeilingUsd', DEFAULT_CEILING_USD));
}

export function setCeiling(db, usd) {
  setSetting(db, 'spendCeilingUsd', usd);
}

export function isBlocked(db) {
  return getSetting(db, 'spendBlocked', '0') === '1';
}

export function spentToday(db) {
  const row = db
    .prepare('SELECT COALESCE(SUM(usd), 0) AS total FROM spend WHERE day = ?')
    .get(today());
  return row.total;
}

export function spendSummary(db) {
  const weekStart = new Date(Date.now() - 6 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return {
    today: spentToday(db),
    ceiling: getCeiling(db),
    blocked: isBlocked(db),
    blockedAt: getSetting(db, 'spendBlockedAt', null),
    byAgentToday: db
      .prepare('SELECT agent, model, inputTokens, outputTokens, usd FROM spend WHERE day = ? ORDER BY usd DESC')
      .all(today()),
    week: db
      .prepare('SELECT day, SUM(usd) AS usd FROM spend WHERE day >= ? GROUP BY day ORDER BY day')
      .all(weekStart),
  };
}

// The trilingual system notice posted in the group when the ceiling is reached.
// One message, all three languages, so every member can read it.
export function ceilingNoticeText() {
  return [
    'Daily usage limit reached. The assistants are paused. Only Rashad can unblock them.',
    'Dnevnoy limit ispolzovaniya dostignut. Assistenty priostanovleny. Tolko Rashad mozhet ikh razblokirovat.',
    'Gunluk istifade limitine chatildi. Assistentler dayandirilib. Yalniz Rashad onlari yeniden ache biler.',
  ].join('\n');
}

// Records usage and enforces the ceiling. onBlock fires exactly once when the
// ceiling trips: the caller wires it to post the chat notice and push the admin.
export function recordSpend(db, { agent, model, inputTokens = 0, outputTokens = 0, usd = null }, onBlock = null) {
  const cost = usd !== null ? usd : costUsd(model, inputTokens, outputTokens);
  db.prepare(
    `INSERT INTO spend (day, agent, model, inputTokens, outputTokens, usd)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(day, agent, model) DO UPDATE SET
       inputTokens = inputTokens + excluded.inputTokens,
       outputTokens = outputTokens + excluded.outputTokens,
       usd = usd + excluded.usd`
  ).run(today(), agent, model, inputTokens, outputTokens, cost);

  if (!isBlocked(db) && spentToday(db) >= getCeiling(db)) {
    setSetting(db, 'spendBlocked', '1');
    setSetting(db, 'spendBlockedAt', new Date().toISOString());
    logEvent(db, 'spend.ceiling.blocked', { spent: spentToday(db), ceiling: getCeiling(db) });
    if (onBlock) onBlock();
  }
  return cost;
}

// Lifted ONLY by the admin, from the dashboard. Never lifts automatically: a new
// day resets the counter but a triggered block stays until the admin acts.
export function unblock(db) {
  setSetting(db, 'spendBlocked', '0');
  setSetting(db, 'spendBlockedAt', '');
  logEvent(db, 'spend.ceiling.unblocked', null);
}

// Gate for agent work (Otto replies, Bob, Mark, digests). Capture-side calls
// (transcription, translation of incoming messages, embeddings) pass
// capture=true and keep running while blocked, per ruling 10.
export function canSpend(db, { capture = false } = {}) {
  if (capture) return true;
  return !isBlocked(db);
}
