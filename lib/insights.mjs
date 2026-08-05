// Insight extraction (Sonnet, spec Section 4 step 7): atomic findings, each
// linked to its source message ids. Insights are what Bob will reason over;
// messages stay the evidence behind them. Batched (daily by default, or on
// demand from the dashboard). This is agent work: it pauses under the spend
// ceiling, unlike capture.

import { complete, untrusted, MODELS, BOUNDARY_NOTE } from './claude.mjs';
import { taxonomyPromptText, sanitizeTags } from './taxonomy.mjs';
import { embedTexts, vectorToBlob } from './embeddings.mjs';
import { getSetting, setSetting, logEvent } from './db.mjs';

const BATCH_SIZE = 60;

export function parseExtractionOutput(raw) {
  try {
    const cleaned = String(raw).replace(/^```json?\s*|```\s*$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
    };
  } catch {
    return { insights: [], proposals: [] };
  }
}

// Validates one raw insight from the model: text, a valid tag, and source ids
// that actually exist in the batch. Unsourced claims are dropped (provenance
// is mandatory, hard rule 6).
export function validateInsight(raw, batchIds, db = null) {
  const text = String(raw.text || '').trim();
  if (!text || text.length < 10) return null;
  const sources = (Array.isArray(raw.sourceMessageIds) ? raw.sourceMessageIds : [])
    .map(String)
    .filter((id) => batchIds.has(id));
  if (!sources.length) return null;
  const [tag] = sanitizeTags([{ tag: raw.tag, confidence: 1 }], db);
  const weight = Math.max(1, Math.min(10, Number(raw.weight) || 1));
  return { text: text.slice(0, 600), tag: tag.tag, weight, sourceMessageIds: sources };
}

function pendingMessages(db) {
  const lastTs = getSetting(db, 'insightsProcessedUpTo', '');
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE senderKind = 'member' AND status = 'active' AND pipelineStatus = 'done'
         AND ts > ? AND (englishText IS NOT NULL OR originalText IS NOT NULL OR transcript IS NOT NULL)
       ORDER BY ts LIMIT ?`
    )
    .all(lastTs, BATCH_SIZE);
}

export async function runExtraction(db, { onBlock = null } = {}) {
  const messages = pendingMessages(db);
  if (!messages.length) return { extracted: 0, proposals: 0, processed: 0 };

  const batchIds = new Set(messages.map((m) => m.id));
  const memberNames = new Map(
    db.prepare('SELECT id, name FROM members').all().map((m) => [m.id, m.name])
  );
  const lines = messages
    .map((m) => {
      const text = (m.englishText || m.originalText || m.transcript || '').slice(0, 800);
      return `[${m.id}] ${memberNames.get(m.senderId) || m.senderId} (${m.language || '?'}): ${text}`;
    })
    .join('\n');

  const raw = await complete({
    agent: 'insights',
    model: MODELS.sonnet,
    db,
    maxTokens: 4000,
    onBlock,
    system:
      'You extract atomic insights from a group chat of appliance repair business owners (individual repairers ' +
      'who also divert overflow jobs to other repairers, so they behave like small shops without storefronts). ' +
      'The corpus feeds two future products: a growth engine (property managers as the priority channel, then ' +
      'consumers) and an operations autopilot. An insight is ONE specific, factual finding about their business ' +
      'reality, pains, numbers, workflows, tools, or opportunities. Example: ' +
      '"Owner B loses about 2 jobs per week to missed calls while he is mid-repair." ' +
      'Skip chit-chat, greetings, and test messages. Each insight cites the message ids it came from. ' +
      'Tags come from this taxonomy (exact strings):\n' +
      taxonomyPromptText(db) +
      '\nIf a real recurring theme fits no subtag, propose a new one as "top-level/new-subtag". ' +
      'Reply as strict JSON: {"insights": [{"text": "...", "tag": "...", "weight": 1-10, ' +
      '"sourceMessageIds": ["..."]}], "proposals": [{"tag": "...", "evidence": "..."}]}. ' +
      'weight reflects how often and how strongly the theme comes up. Nothing outside the JSON. ' +
      BOUNDARY_NOTE,
    messages: [{ role: 'user', content: untrusted(lines) }],
  });

  const { insights: rawInsights, proposals: rawProposals } = parseExtractionOutput(raw);
  const now = new Date().toISOString();

  const valid = rawInsights
    .map((r) => validateInsight(r, batchIds, db))
    .filter(Boolean);

  // Embed insights so they are retrievable alongside chunks.
  let vectors = [];
  try {
    vectors = valid.length ? await embedTexts(db, valid.map((i) => i.text)) : [];
  } catch {
    vectors = [];
  }

  const insert = db.prepare(
    'INSERT INTO insights (text, tag, weight, sourceMessageIds, extractedAt, embedding) VALUES (?, ?, ?, ?, ?, ?)'
  );
  valid.forEach((i, idx) => {
    insert.run(i.text, i.tag, i.weight, JSON.stringify(i.sourceMessageIds), now,
      vectors[idx] ? vectorToBlob(vectors[idx]) : null);
  });

  let proposalCount = 0;
  for (const p of rawProposals) {
    const tag = String(p.tag || '').trim().toLowerCase();
    if (!/^[a-z-]+\/[a-z][a-z0-9-]+$/.test(tag)) continue;
    const exists = db.prepare('SELECT id FROM taxonomy_proposals WHERE tag = ?').get(tag);
    if (exists) continue;
    db.prepare(
      "INSERT INTO taxonomy_proposals (tag, proposedBy, evidence, proposedAt) VALUES (?, 'extractor', ?, ?)"
    ).run(tag, String(p.evidence || '').slice(0, 500), now);
    proposalCount++;
  }

  setSetting(db, 'insightsProcessedUpTo', messages[messages.length - 1].ts);
  setSetting(db, 'insightsLastRunAt', now);
  logEvent(db, 'insights.extracted', { processed: messages.length, insights: valid.length, proposals: proposalCount });
  return { extracted: valid.length, proposals: proposalCount, processed: messages.length };
}

// Daily schedule: called hourly by the server; runs when there is something new
// and the last run is more than ~20 hours old.
export async function maybeRunScheduled(db, { onBlock = null } = {}) {
  const last = getSetting(db, 'insightsLastRunAt', '');
  const intervalHours = Number(getSetting(db, 'insightsIntervalHours', 6));
  if (last && Date.now() - new Date(last).getTime() < intervalHours * 3600 * 1000) return null;
  if (!pendingMessages(db).length) return null;
  try {
    return await runExtraction(db, { onBlock });
  } catch (err) {
    logEvent(db, 'insights.error', { error: err.message });
    return null;
  }
}
