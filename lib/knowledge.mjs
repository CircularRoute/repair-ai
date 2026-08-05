// Phase 6: admin-uploaded knowledge (spec Section 8). Files, pasted notes, and
// links are stored, text-extracted, and chunked+embedded into the shared
// retrieval space under 'kn:<id>' pseudo message ids, so Bob and Otto retrieve
// them like everything else. Members equip the agents only by talking in the
// group; this door is admin-only.

import { readFileSync } from 'node:fs';
import { chunkText, embedTexts, vectorToBlob } from './embeddings.mjs';
import { logEvent } from './db.mjs';

const MAX_TEXT = 200_000;

export async function extractTextFromFile(fileName, buf) {
  const ext = String(fileName).split('.').pop().toLowerCase();
  if (['txt', 'md', 'csv'].includes(ext)) return buf.toString('utf8').slice(0, MAX_TEXT);
  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    await parser.destroy().catch(() => {});
    return String(result.text || '').slice(0, MAX_TEXT);
  }
  throw new Error(`cannot extract text from .${ext} yet (txt, md, csv, pdf supported)`);
}

// Crude but dependency-free html-to-text for link ingestion.
export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

async function indexKnowledge(db, id, title, text) {
  const chunks = chunkText(text, 1000);
  if (!chunks.length) throw new Error('no extractable text');
  const vectors = await embedTexts(db, chunks);
  db.prepare('DELETE FROM chunks WHERE messageId = ?').run(`kn:${id}`);
  const insert = db.prepare('INSERT INTO chunks (messageId, text, embedding) VALUES (?, ?, ?)');
  chunks.forEach((c, i) => insert.run(`kn:${id}`, `[${title}] ${c}`, vectors[i] ? vectorToBlob(vectors[i]) : null));
  return chunks.length;
}

export async function addKnowledgeFile(db, { title, path, buf, fileName }) {
  const text = await extractTextFromFile(fileName, buf ?? readFileSync(path));
  const info = db.prepare("INSERT INTO knowledge (title, kind, path, addedAt) VALUES (?, 'file', ?, ?)")
    .run(title, path, new Date().toISOString());
  const chunks = await indexKnowledge(db, info.lastInsertRowid, title, text);
  logEvent(db, 'knowledge.added', { id: info.lastInsertRowid, kind: 'file', title, chunks });
  return { id: info.lastInsertRowid, chunks };
}

export async function addKnowledgeNote(db, { title, text }) {
  const info = db.prepare("INSERT INTO knowledge (title, kind, addedAt) VALUES (?, 'note', ?)")
    .run(title, new Date().toISOString());
  const chunks = await indexKnowledge(db, info.lastInsertRowid, title, String(text).slice(0, MAX_TEXT));
  logEvent(db, 'knowledge.added', { id: info.lastInsertRowid, kind: 'note', title, chunks });
  return { id: info.lastInsertRowid, chunks };
}

export async function addKnowledgeLink(db, { url }) {
  if (!/^https:\/\//.test(url)) throw new Error('links must be https://');
  const res = await fetch(url, { headers: { Accept: 'text/html,*/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const raw = await res.text();
  const text = htmlToText(raw);
  const titleMatch = /<title[^>]*>([^<]{1,150})/i.exec(raw);
  const title = (titleMatch ? titleMatch[1].trim() : url).slice(0, 150);
  const info = db.prepare("INSERT INTO knowledge (title, kind, url, addedAt) VALUES (?, 'link', ?, ?)")
    .run(title, url, new Date().toISOString());
  const chunks = await indexKnowledge(db, info.lastInsertRowid, title, `${text}\nSource: ${url}`);
  logEvent(db, 'knowledge.added', { id: info.lastInsertRowid, kind: 'link', title, chunks });
  return { id: info.lastInsertRowid, title, chunks };
}

export function listKnowledge(db) {
  return db.prepare("SELECT * FROM knowledge WHERE status = 'active' ORDER BY id DESC").all();
}

// Retire (never delete): the source row stays; derived chunks leave retrieval.
export function retireKnowledge(db, id) {
  db.prepare("UPDATE knowledge SET status = 'retired' WHERE id = ?").run(Number(id));
  db.prepare('DELETE FROM chunks WHERE messageId = ?').run(`kn:${id}`);
  logEvent(db, 'knowledge.retired', { id });
}
