// Per-message classification (Haiku, spec Section 4 step 5): multi-label with
// confidence against the admin-approved taxonomy. Runs as part of capture.

import { complete, untrusted, MODELS, BOUNDARY_NOTE } from './claude.mjs';
import { taxonomyPromptText, sanitizeTags } from './taxonomy.mjs';
import { logEvent } from './db.mjs';

export function parseClassifierOutput(raw) {
  try {
    const cleaned = String(raw).replace(/^```json?\s*|```\s*$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : parsed.tags || [];
  } catch {
    return [];
  }
}

export async function classifyMessage(db, msg, { onBlock = null } = {}) {
  const text = msg.englishText || msg.originalText || msg.transcript;
  if (!text || !text.trim()) return [];
  const raw = await complete({
    agent: 'pipeline',
    model: MODELS.haiku,
    db,
    capture: true,
    maxTokens: 300,
    onBlock,
    system:
      'You tag messages from a group chat of appliance repair business owners. ' +
      'Choose 1 to 3 tags from this taxonomy (use the exact strings, prefer specific top/sub tags over bare top levels):\n' +
      taxonomyPromptText(db) +
      '\nReply as strict JSON: [{"tag": "...", "confidence": 0.0-1.0}]. Nothing else. ' +
      BOUNDARY_NOTE,
    messages: [{ role: 'user', content: untrusted(text) }],
  });
  const tags = sanitizeTags(parseClassifierOutput(raw), db);
  const stmt = db.prepare(
    "INSERT INTO tags (messageId, tag, confidence, source) VALUES (?, ?, ?, 'classifier') " +
    'ON CONFLICT(messageId, tag) DO UPDATE SET confidence = excluded.confidence'
  );
  for (const t of tags) stmt.run(msg.id, t.tag, t.confidence);
  logEvent(db, 'classify.done', { messageId: msg.id, tags: tags.map((t) => t.tag) });
  return tags;
}
