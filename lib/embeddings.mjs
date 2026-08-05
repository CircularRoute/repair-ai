// Embeddings: OpenAI text-embedding-3-large over the English working copies
// (spec Section 4 step 6). Vectors live in SQLite as Float32 BLOBs; brute-force
// cosine in memory is correct at this scale (thousands of chunks).

import OpenAI from 'openai';
import { recordSpend } from './spend.mjs';

const MODEL = 'text-embedding-3-large';

let client = null;
function getClient() {
  if (!client) client = new OpenAI();
  return client;
}

export async function embedTexts(db, texts) {
  if (!texts.length) return [];
  const res = await getClient().embeddings.create({ model: MODEL, input: texts });
  recordSpend(db, {
    agent: 'pipeline',
    model: MODEL,
    inputTokens: res.usage?.prompt_tokens || 0,
  });
  return res.data.map((d) => d.embedding);
}

export function vectorToBlob(vector) {
  return Buffer.from(new Float32Array(vector).buffer);
}

export function blobToVector(blob) {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Deterministic chunker (spec: one message is usually one chunk; long
// monologues split). Splits on paragraph then sentence boundaries at ~1200
// chars so chunks stay coherent without an LLM call.
export function chunkText(text, maxLen = 1200) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const parts = [];
  let current = '';
  const paragraphs = clean.split(/\n{2,}/);
  const pieces = [];
  for (const p of paragraphs) {
    if (p.length <= maxLen) pieces.push(p);
    else pieces.push(...p.split(/(?<=[.!?])\s+/));
  }
  for (const piece of pieces) {
    if ((current + ' ' + piece).trim().length > maxLen && current) {
      parts.push(current.trim());
      current = piece;
    } else {
      current = (current + ' ' + piece).trim();
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Ranks all embedded chunks against a query vector. Returns
// [{chunkId, messageId, text, score}] sorted by score desc.
export function rankChunks(db, queryVector, limit = 30) {
  const rows = db.prepare('SELECT id, messageId, text, embedding FROM chunks WHERE embedding IS NOT NULL').all();
  const q = Float32Array.from(queryVector);
  const scored = rows.map((r) => ({
    chunkId: r.id,
    messageId: r.messageId,
    text: r.text,
    score: cosine(q, blobToVector(r.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
