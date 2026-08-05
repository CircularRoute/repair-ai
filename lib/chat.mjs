// Chat core: message storage, the live SSE hub, and the ceiling-block notice.

import { randomBytes } from 'node:crypto';
import { logEvent } from './db.mjs';
import { ceilingNoticeText } from './spend.mjs';
import { notifyMembers, notifyAdmin } from './push.mjs';

const sseClients = new Set();

export function addSseClient(res) {
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

export function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(res);
    }
  }
}

export function newMessageId() {
  return `m_${Date.now()}_${randomBytes(6).toString('hex')}`;
}

export function insertMessage(db, fields) {
  const id = fields.id || newMessageId();
  db.prepare(
    `INSERT INTO messages (id, senderId, senderKind, ts, kind, originalText, audioPath,
       filePath, fileName, fileMime, fileSize, replyToId, pipelineStatus, language, englishText)
     VALUES (@id, @senderId, @senderKind, @ts, @kind, @originalText, @audioPath,
       @filePath, @fileName, @fileMime, @fileSize, @replyToId, @pipelineStatus, @language, @englishText)`
  ).run({
    id,
    senderId: fields.senderId,
    senderKind: fields.senderKind,
    ts: fields.ts || new Date().toISOString(),
    kind: fields.kind,
    originalText: fields.originalText ?? null,
    audioPath: fields.audioPath ?? null,
    filePath: fields.filePath ?? null,
    fileName: fields.fileName ?? null,
    fileMime: fields.fileMime ?? null,
    fileSize: fields.fileSize ?? null,
    replyToId: fields.replyToId ?? null,
    pipelineStatus: fields.pipelineStatus || 'pending',
    language: fields.language ?? null,
    englishText: fields.englishText ?? null,
  });
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

// Public view of a message for chat clients (no pipeline internals).
export function messageView(db, msg) {
  const member = db.prepare('SELECT name FROM members WHERE id = ?').get(msg.senderId);
  return {
    id: msg.id,
    senderId: msg.senderId,
    senderKind: msg.senderKind,
    senderName:
      msg.senderKind === 'agent' ? 'Otto' : msg.senderKind === 'system' ? 'System' : member?.name || msg.senderId,
    ts: msg.ts,
    kind: msg.kind,
    text: msg.originalText || msg.transcript || null,
    hasAudio: Boolean(msg.audioPath),
    fileName: msg.fileName || null,
    fileSize: msg.fileSize || null,
    replyToId: msg.replyToId || null,
  };
}

export function postAndBroadcast(db, fields) {
  const msg = insertMessage(db, fields);
  broadcast({ type: 'message', message: messageView(db, msg) });
  return msg;
}

// Wired as the onBlock callback for spend metering: posts the trilingual system
// notice in the group (once) and pushes the admin (ruling 10).
export function makeCeilingBlockHandler(db) {
  return () => {
    postAndBroadcast(db, {
      senderId: 'system',
      senderKind: 'system',
      kind: 'text',
      originalText: ceilingNoticeText(),
      pipelineStatus: 'done',
      language: 'en',
    });
    logEvent(db, 'spend.ceiling.notice_posted', null);
    notifyAdmin(db, {
      title: 'Repair AI: daily limit reached',
      body: 'The daily spend ceiling was reached. Agents are paused until you unblock.',
      url: '/admin',
    }).catch(() => {});
    notifyMembers(db, {
      title: 'Repair AI',
      body: 'Daily usage limit reached. Assistants are paused.',
    }).catch(() => {});
  };
}
