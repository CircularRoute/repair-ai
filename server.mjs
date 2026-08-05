// Repair AI - single service, no framework. Phase 1: member chat PWA (text, voice,
// allowlisted attachments), invite flow, capture pipeline, push notifications,
// spend meter with the $30/day ceiling, Otto onboarding-only.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream, readdirSync, unlinkSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { loadEnv, requireEnv } from './lib/env.mjs';
import { openDb, ensureAdminMember, logEvent, resolveDataDir, getSetting, setSetting } from './lib/db.mjs';
import {
  SESSION_COOKIE, safeEqual, createSession, getSession, retireSession,
  mintMagicLink, consumeMagicLink, mintLoginCode, consumeLoginCode,
  sessionCookieHeader, clearCookieHeader, readCookies,
} from './lib/auth.mjs';
import { sendLoginCode, sendWelcome, emailConfigured } from './lib/email.mjs';
import {
  validateAttachment, storeFile, MAX_FILE_BYTES, MAX_AUDIO_BYTES, ALLOWED_EXTENSIONS,
} from './lib/files.mjs';
import { schedule as schedulePipeline } from './lib/pipeline.mjs';
import {
  addSseClient, postAndBroadcast, messageView, makeCeilingBlockHandler, broadcast,
} from './lib/chat.mjs';
import { spendSummary, setCeiling, unblock, isBlocked } from './lib/spend.mjs';
import { configurePush, vapidPublicKey, saveSubscription, disableSubscription, notifyMembers } from './lib/push.mjs';
import { OTTO_ID, onboardingMessage } from './lib/otto.mjs';
import { embedTexts, rankChunks, blobToVector, cosine } from './lib/embeddings.mjs';
import { runExtraction, maybeRunScheduled } from './lib/insights.mjs';
import { validTags } from './lib/taxonomy.mjs';
import {
  CAP_LINES, CHECK_ACK, CHECK_THIN, ottoSettings, isEngagement, exchangeGate, recordOttoReply,
  canIntervene, recordIntervention, memberPrefersVoice, generateReply, generateIntervention,
  fileAgentRequest, answerAgentRequest, generateRelay,
  ottoChat, ottoChatHistory, getOttoDirectives, removeOttoDirective,
} from './lib/otto-engine.mjs';
import { MARK_DOC_TYPES, runMarkDocument, runMarkCustom, runMarkAll, answerFromResearch, queueResearch, getQueue, maybeRunMarkWeekly, markChat, markChatHistory, getDirectives, removeDirective } from './lib/mark.mjs';
import { transcribe } from './lib/voice.mjs';
import { listTools, registerTool, retireTool } from './lib/tools.mjs';
import { addKnowledgeFile, addKnowledgeNote, addKnowledgeLink, listKnowledge, retireKnowledge } from './lib/knowledge.mjs';
import { bobAnswerQuestion } from './lib/bob.mjs';
import { tts } from './lib/voice.mjs';
import {
  DOCUMENT_TYPES, getDocuments, getDocument, generateDocument, weeklySynthesis,
  nightlyDigest, maybeEventUpdate, bobChat, bobChatHistory, maybeRunBobSchedules,
  getBobDirectives, removeBobDirective,
} from './lib/bob.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const { path: envPath } = loadEnv();
console.log('env file path in use (values never logged):', envPath);
requireEnv(['REPAIR_ADMIN_TOKEN']);
if (!configurePush()) {
  console.log('push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set');
}

const db = openDb();
const adminId = ensureAdminMember(db);
const dataDir = resolveDataDir();
const onBlock = makeCeilingBlockHandler(db);
const PORT = Number(process.env.PORT || 8790);
const SECURE_COOKIES = process.env.NODE_ENV === 'production';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const AUDIO_MIME = {
  m4a: 'audio/mp4', mp4: 'audio/mp4', webm: 'audio/webm', ogg: 'audio/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}
function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
}
function redirect(res, location, headers = {}) {
  send(res, 302, '', { Location: location, ...headers });
}
function serveFile(res, filePath, extraHeaders = {}) {
  const type = MIME[extname(filePath)] || 'application/octet-stream';
  send(res, 200, readFileSync(filePath), { 'Content-Type': type, ...extraHeaders });
}

async function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { code: 'TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req, limit = 256 * 1024) {
  const buf = await readBody(req, limit);
  try {
    return buf.length ? JSON.parse(buf.toString('utf8')) : {};
  } catch {
    throw new Error('invalid json');
  }
}

function currentSession(req) {
  const cookies = readCookies(req.headers.cookie);
  return getSession(db, cookies[SESSION_COOKIE]);
}

function requireMember(req, res) {
  const session = currentSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'not logged in' });
    return null;
  }
  return session;
}

function requireAdmin(req, res) {
  const session = currentSession(req);
  if (!session || session.role !== 'admin') {
    sendJson(res, 401, { error: 'admin session required' });
    return null;
  }
  return session;
}

// Serve a stored file safely: confined to dataDir, download-only for
// attachments, inline for audio. Supports HTTP Range requests, which iOS
// Safari REQUIRES before it will play audio or video at all.
function serveStoredFile(req, res, filePath, { fileName, mime, inlineAudio = false }) {
  const resolved = normalize(filePath);
  if (!resolved.startsWith(normalize(dataDir)) || !existsSync(resolved)) {
    return send(res, 404, 'Not found');
  }
  const size = statSync(resolved).size;
  const headers = {
    'Content-Type': mime || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': inlineAudio
      ? 'inline'
      : `attachment; filename="${(fileName || 'file').replace(/[^\w.\- ]/g, '_')}"`,
  };

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match && (match[1] !== '' || match[2] !== '')) {
      let start = match[1] === '' ? size - Number(match[2]) : Number(match[1]);
      let end = match[1] !== '' && match[2] !== '' ? Number(match[2]) : size - 1;
      if (start < 0) start = 0;
      if (end >= size) end = size - 1;
      if (start > end || start >= size) {
        return send(res, 416, '', { 'Content-Range': `bytes */${size}` });
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': end - start + 1,
      });
      createReadStream(resolved, { start, end }).pipe(res);
      return;
    }
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  createReadStream(resolved).pipe(res);
}

// Posts an Otto message (text, optionally as a voice note with the text kept).
// Ruling 23 (amended): Otto mirrors the member - a voice message gets a voice
// reply, a text message gets text (replyToKind). Proactive messages with no
// message to mirror fall back to the voice-heavy-member heuristic. The admin
// voicePref (always/never) remains as a per-member override only.
async function postOttoMessage(text, { language = null, memberIdFor = null, replyToKind = null } = {}) {
  let audioPath = null;
  const settings = ottoSettings(db);
  const pref = memberIdFor
    ? db.prepare('SELECT voicePref FROM members WHERE id = ?').get(memberIdFor)?.voicePref || 'auto'
    : 'auto';
  const isQuestion = text.includes('?') && text.length <= 350;
  const wantsVoice =
    pref === 'always' ||
    (pref === 'auto' && (replyToKind
      ? replyToKind === 'voice'
      : isQuestion && memberPrefersVoice(db, memberIdFor)));
  if (
    memberIdFor && pref !== 'never' && wantsVoice &&
    settings.voiceLangs.includes(language || 'en')
  ) {
    try {
      const buf = await tts(db, { text, voice: settings.voice || 'echo', agent: 'otto' });
      const stored = storeFile(dataDir, 'audio', 'mp3', buf);
      audioPath = stored.path;
    } catch (err) {
      logEvent(db, 'otto.tts_failed', { error: err.message });
    }
  }
  const msg = postAndBroadcast(db, {
    senderId: OTTO_ID,
    senderKind: 'agent',
    kind: audioPath ? 'voice' : 'text',
    originalText: text,
    audioPath,
    transcript: audioPath ? text : null,
    pipelineStatus: 'done',
    language,
  });
  notifyMembers(db, { excludeMemberId: null, title: 'Repair AI', body: `Otto: ${text.slice(0, 80)}` }).catch(() => {});
  return msg;
}

// Otto's engagement check, run after the pipeline finishes a member message.
async function ottoConsider(processedMsg) {
  try {
    if (processedMsg.senderKind !== 'member' || processedMsg.status !== 'active') return;
    const settings = ottoSettings(db);
    if (settings.muted) return;
    if (!isEngagement(db, processedMsg)) return;
    const gate = exchangeGate(db, processedMsg.senderId);
    if (gate === 'silent') return;
    const language = processedMsg.language || 'en';
    const mirror = { language, memberIdFor: processedMsg.senderId, replyToKind: processedMsg.kind };
    if (gate === 'cap') {
      // The founder's verbatim line, translated, then quiet on this thread.
      await postOttoMessage(CAP_LINES[language] || CAP_LINES.en, mirror);
      recordOttoReply(db, processedMsg.senderId, { capped: true });
      logEvent(db, 'otto.capped', { memberId: processedMsg.senderId });
      return;
    }
    const result = await generateReply(db, processedMsg, { onBlock });
    if (!result) return;
    if (result.kind === 'check') {
      // Check-with protocol (spec 7b): acknowledge, file, resolve, relay.
      await postOttoMessage((CHECK_ACK[result.toAgent] || CHECK_ACK.mark)[language] || CHECK_ACK[result.toAgent].en, mirror);
      recordOttoReply(db, processedMsg.senderId);
      const requestId = fileAgentRequest(db, {
        toAgent: result.toAgent, question: result.question, contextRefs: [processedMsg.id],
      });
      resolveAgentRequest(requestId, result.toAgent, result.question, {
        language, memberName: db.prepare('SELECT name FROM members WHERE id = ?').get(processedMsg.senderId)?.name || 'the member',
        mirror,
      }).catch((err) => logEvent(db, 'agent_request.error', { requestId, error: err.message }));
      return;
    }
    await postOttoMessage(result.text, mirror);
    recordOttoReply(db, processedMsg.senderId);
    logEvent(db, 'otto.replied', { to: processedMsg.senderId });
  } catch (err) {
    if (err.code !== 'SPEND_BLOCKED') logEvent(db, 'otto.error', { error: err.message });
  }
}

// Resolves a check-with request: Bob answers from retrieval, Mark from his
// existing research shelf; thin answers queue research and say so plainly.
async function resolveAgentRequest(requestId, toAgent, question, { language, memberName, mirror = null }) {
  const answer = toAgent === 'bob'
    ? await bobAnswerQuestion(db, question, { onBlock })
    : await answerFromResearch(db, question, { onBlock });
  if (!answer) {
    if (toAgent === 'mark') queueResearch(db, question);
    answerAgentRequest(db, requestId, null, 'declined');
    await postOttoMessage((CHECK_THIN[toAgent] || CHECK_THIN.mark)[language] || CHECK_THIN[toAgent].en, mirror || { language });
    return;
  }
  answerAgentRequest(db, requestId, answer, 'answered');
  const relay = await generateRelay(db, { toAgent, answer, language, memberName }, { onBlock });
  if (relay) {
    await postOttoMessage(relay, mirror || { language });
    answerAgentRequest(db, requestId, answer, 'relayed');
  }
}

function postMemberMessage(session, fields) {
  const msg = postAndBroadcast(db, { senderId: session.memberId, senderKind: 'member', ...fields });
  schedulePipeline(db, msg.id, { onBlock, onProcessed: ottoConsider });
  notifyMembers(db, {
    excludeMemberId: session.memberId,
    title: 'Repair AI',
    body: `${session.name}: ${fields.kind === 'text' ? String(fields.originalText).slice(0, 80) : fields.kind === 'voice' ? 'voice note' : fields.fileName || 'attachment'}`,
  }).catch(() => {});
  return msg;
}

// Otto onboarding fires exactly once, on a member's first successful sign-in
// by any path (invite link, email code, or sign-in link).
function ensureOnboarded(member) {
  if (member.consentShownAt) return;
  const now = new Date().toISOString();
  db.prepare('UPDATE members SET consentShownAt = ?, joinedAt = ? WHERE id = ?').run(now, now, member.id);
  postAndBroadcast(db, {
    senderId: OTTO_ID,
    senderKind: 'agent',
    kind: 'text',
    originalText: onboardingMessage(member.name, member.language),
    pipelineStatus: 'done',
    language: member.language,
  });
  logEvent(db, 'member.joined', { memberId: member.id });
  notifyMembers(db, {
    excludeMemberId: member.id,
    title: 'Repair AI',
    body: `${member.name} joined the group`,
  }).catch(() => {});
}

// Simple in-memory rate limit for email-code requests.
const codeRequests = new Map();
function codeRequestAllowed(key, max = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const list = (codeRequests.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now);
  codeRequests.set(key, list);
  return true;
}

function findMemberByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  return db
    .prepare("SELECT * FROM members WHERE lower(email) = ? AND status != 'retired'")
    .get(normalized);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  try {
    if (path === '/healthz') return sendJson(res, 200, { ok: true, service: 'repair-ai' });

    // ---------- Auth ----------
    if (path === '/login' && req.method === 'GET') return serveFile(res, join(root, 'public', 'login.html'));

    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!safeEqual(body.token || '', process.env.REPAIR_ADMIN_TOKEN)) {
        logEvent(db, 'auth.login.denied', null);
        return sendJson(res, 401, { error: 'invalid token' });
      }
      const session = createSession(db, adminId);
      logEvent(db, 'auth.login.ok', { memberId: adminId });
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, { secure: SECURE_COOKIES }),
      });
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      const session = currentSession(req);
      if (session) retireSession(db, session.id);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookieHeader({ secure: SECURE_COOKIES }) });
    }

    if (path === '/api/me') {
      const session = requireMember(req, res);
      if (!session) return;
      return sendJson(res, 200, { memberId: session.memberId, name: session.name, role: session.role });
    }

    // ---------- Email sign-in (ruling 13) ----------
    // Request a 6-digit code. The response is identical whether or not the
    // email is on the allowlist, so addresses cannot be probed.
    if (path === '/api/auth/request-code' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const generic = { ok: true, message: 'If this email is on the member list, a code is on its way.' };
      if (!email || !emailConfigured()) return sendJson(res, 200, generic);
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      if (!codeRequestAllowed(`e:${email}`) || !codeRequestAllowed(`ip:${ip}`, 20)) {
        return sendJson(res, 200, generic);
      }
      const member = findMemberByEmail(email);
      if (member) {
        const { code } = mintLoginCode(db, member.id);
        const link = mintMagicLink(db, member.id, 'signin', new Date(), 15);
        try {
          await sendLoginCode({
            to: email,
            name: member.name,
            language: member.language,
            code,
            url: `${url.origin}/signin/${link.token}`,
          });
          logEvent(db, 'auth.code.sent', { memberId: member.id });
        } catch (err) {
          logEvent(db, 'auth.code.send_failed', { memberId: member.id, error: err.message });
        }
      }
      return sendJson(res, 200, generic);
    }

    if (path === '/api/auth/verify-code' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const member = findMemberByEmail(body.email);
      const code = String(body.code || '').trim();
      if (!member || !/^\d{6}$/.test(code) || !consumeLoginCode(db, member.id, code)) {
        logEvent(db, 'auth.code.denied', null);
        return sendJson(res, 401, { error: 'wrong or expired code' });
      }
      const session = createSession(db, member.id);
      ensureOnboarded(db.prepare('SELECT * FROM members WHERE id = ?').get(member.id));
      logEvent(db, 'auth.code.ok', { memberId: member.id });
      return sendJson(res, 200, { ok: true, name: member.name }, {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, { secure: SECURE_COOKIES }),
      });
    }

    // Sign-in link landing page (desktop fallback): GET shows a button, POST
    // consumes, so email scanners cannot burn the link.
    if (path.startsWith('/signin/') && req.method === 'GET') {
      return serveFile(res, join(root, 'public', 'signin.html'));
    }
    if (path === '/api/auth/signin' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const consumed = consumeMagicLink(db, body.token || '');
      if (!consumed || consumed.purpose !== 'signin') {
        return sendJson(res, 410, { error: 'sign-in link is no longer valid; request a new code' });
      }
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(consumed.memberId);
      if (!member || member.status === 'retired') return sendJson(res, 410, { error: 'not a member' });
      const session = createSession(db, member.id);
      ensureOnboarded(member);
      return sendJson(res, 200, { ok: true, name: member.name }, {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, { secure: SECURE_COOKIES }),
      });
    }

    // ---------- Invite flow (members) ----------
    // GET /join/:token shows the welcome + add-to-home-screen walkthrough WITHOUT
    // consuming the token (link previews must not burn it). POST consumes.
    if (path.startsWith('/join/') && req.method === 'GET') {
      return serveFile(res, join(root, 'public', 'join.html'));
    }

    if (path === '/api/auth/join' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const consumed = consumeMagicLink(db, body.token || '');
      if (!consumed || consumed.purpose !== 'invite') {
        return sendJson(res, 410, { error: 'invite link is no longer valid' });
      }
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(consumed.memberId);
      const session = createSession(db, member.id);
      ensureOnboarded(member);
      return sendJson(res, 200, { ok: true, name: member.name }, {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, { secure: SECURE_COOKIES }),
      });
    }

    // Mint a single-use admin login link (admin only). Returned to the admin,
    // never sent anywhere (no external sends).
    if (path === '/api/auth/magic-link' && req.method === 'POST') {
      const session = requireAdmin(req, res);
      if (!session) return;
      const link = mintMagicLink(db, session.memberId, 'login');
      logEvent(db, 'auth.magiclink.minted', { memberId: session.memberId });
      return sendJson(res, 200, { url: `${url.origin}/a/${link.token}`, expiresAt: link.expiresAt.toISOString() });
    }

    // Admin magic link (kept from Phase 0): GET consumes and signs in.
    if (path.startsWith('/a/') && req.method === 'GET') {
      const consumed = consumeMagicLink(db, path.slice(3));
      if (!consumed) return send(res, 410, 'This link is no longer valid.');
      const session = createSession(db, consumed.memberId);
      return redirect(res, '/admin', {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, { secure: SECURE_COOKIES }),
      });
    }

    // ---------- Chat API (any signed-in member) ----------
    if (path === '/api/chat/messages' && req.method === 'GET') {
      const session = requireMember(req, res);
      if (!session) return;
      const after = url.searchParams.get('after');
      // Deleted messages are included as placeholders (ruling 12).
      const rows = after
        ? db.prepare("SELECT * FROM messages WHERE status IN ('active','deleted') AND ts > ? ORDER BY ts LIMIT 200").all(after)
        : db.prepare("SELECT * FROM messages WHERE status IN ('active','deleted') ORDER BY ts DESC LIMIT 100").all().reverse();
      return sendJson(res, 200, { messages: rows.map((m) => messageView(db, m)) });
    }

    // WhatsApp-style delete (ruling 12): a member deletes their own message;
    // the admin can delete any. Content is retained (never-delete rule) but
    // leaves the chat for everyone and is excluded from agent retrieval.
    if (path === '/api/chat/message/delete' && req.method === 'POST') {
      const session = requireMember(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(body.messageId || '');
      if (!msg || msg.status === 'retired') return sendJson(res, 404, { error: 'message not found' });
      const isOwn = msg.senderKind === 'member' && msg.senderId === session.memberId;
      if (!isOwn && session.role !== 'admin') {
        return sendJson(res, 403, { error: 'you can only delete your own messages' });
      }
      if (msg.status !== 'deleted') {
        db.prepare("UPDATE messages SET status = 'deleted', deletedAt = ? WHERE id = ?")
          .run(new Date().toISOString(), msg.id);
        logEvent(db, 'message.deleted', { messageId: msg.id, by: session.memberId });
        broadcast({ type: 'message', message: messageView(db, db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id)) });
      }
      return sendJson(res, 200, { ok: true });
    }

    if (path === '/api/chat/stream' && req.method === 'GET') {
      const session = requireMember(req, res);
      if (!session) return;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"type":"hello"}\n\n');
      addSseClient(res);
      return;
    }

    if (path === '/api/chat/message' && req.method === 'POST') {
      const session = requireMember(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      const text = String(body.text || '').trim();
      if (!text) return sendJson(res, 400, { error: 'empty message' });
      if (text.length > 8000) return sendJson(res, 400, { error: 'message too long' });
      const msg = postMemberMessage(session, { kind: 'text', originalText: text, replyToId: body.replyToId || null });
      return sendJson(res, 200, { ok: true, message: messageView(db, msg) });
    }

    // Voice note: raw body upload, mime in Content-Type, stored as-is (no
    // client-side transcoding; Safari sends AAC mp4, Chrome sends Opus webm).
    if (path === '/api/chat/voice' && req.method === 'POST') {
      const session = requireMember(req, res);
      if (!session) return;
      const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') || mime.includes('3gpp') ? 'm4a' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : null;
      if (!ext) {
        logEvent(db, 'voice.rejected', { memberId: session.memberId, mime, reason: 'unsupported type' });
        return sendJson(res, 400, { error: `unsupported audio type (${mime || 'none'})` });
      }
      let buf;
      try {
        buf = await readBody(req, MAX_AUDIO_BYTES);
      } catch (err) {
        return sendJson(res, 413, { error: err.code === 'TOO_LARGE' ? 'audio too large' : 'upload failed' });
      }
      if (!buf.length) return sendJson(res, 400, { error: 'empty audio' });
      const stored = storeFile(dataDir, 'audio', ext, buf);
      const msg = postMemberMessage(session, { kind: 'voice', audioPath: stored.path });
      return sendJson(res, 200, { ok: true, message: messageView(db, msg) });
    }

    // Attachment: raw body upload with X-File-Name header; strict allowlist
    // validation server-side (ruling 8).
    if (path === '/api/chat/file' && req.method === 'POST') {
      const session = requireMember(req, res);
      if (!session) return;
      const fileName = decodeURIComponent(req.headers['x-file-name'] || '');
      const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      let buf;
      try {
        buf = await readBody(req, MAX_FILE_BYTES);
      } catch (err) {
        return sendJson(res, 413, { error: err.code === 'TOO_LARGE' ? 'file too large' : 'upload failed' });
      }
      const verdict = validateAttachment({ fileName, mime, buf });
      if (!verdict.ok) {
        logEvent(db, 'file.rejected', { memberId: session.memberId, fileName, reason: verdict.reason });
        return sendJson(res, 400, { error: verdict.reason });
      }
      const stored = storeFile(dataDir, 'files', verdict.ext, buf);
      const msg = postMemberMessage(session, {
        kind: 'file',
        filePath: stored.path,
        fileName: fileName || stored.name,
        fileMime: ALLOWED_EXTENSIONS[verdict.ext][0],
        fileSize: buf.length,
      });
      return sendJson(res, 200, { ok: true, message: messageView(db, msg) });
    }

    // Download an attachment or play a voice note.
    if (path.startsWith('/api/chat/media/') && req.method === 'GET') {
      const session = requireMember(req, res);
      if (!session) return;
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(path.split('/').pop());
      if (!msg || msg.status === 'deleted') return send(res, 404, 'Not found');
      if (msg.audioPath) {
        const ext = msg.audioPath.split('.').pop();
        return serveStoredFile(req, res, msg.audioPath, { mime: AUDIO_MIME[ext] || 'audio/mpeg', inlineAudio: true });
      }
      if (msg.filePath) {
        return serveStoredFile(req, res, msg.filePath, { fileName: msg.fileName, mime: msg.fileMime });
      }
      return send(res, 404, 'Not found');
    }

    // ---------- Push ----------
    if (path === '/api/push/key' && req.method === 'GET') {
      const session = requireMember(req, res);
      if (!session) return;
      return sendJson(res, 200, { key: vapidPublicKey() });
    }
    if (path === '/api/push/subscribe' && req.method === 'POST') {
      const session = requireMember(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      if (!body.subscription?.endpoint) return sendJson(res, 400, { error: 'invalid subscription' });
      saveSubscription(db, session.memberId, body.subscription);
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/api/push/unsubscribe' && req.method === 'POST') {
      const session = requireMember(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      if (!body.endpoint) return sendJson(res, 400, { error: 'invalid endpoint' });
      const ok = disableSubscription(db, session.memberId, body.endpoint);
      if (ok) logEvent(db, 'push.disabled', { memberId: session.memberId });
      return sendJson(res, 200, { ok });
    }

    // ---------- Admin APIs ----------
    if (path === '/api/admin/members' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const members = db.prepare("SELECT id, name, role, language, languages, email, status, joinedAt, consentShownAt, voicePref FROM members ORDER BY joinedAt").all();
      const invites = db.prepare(
        "SELECT ml.token, ml.memberId, ml.expiresAt, ml.usedAt, m.name FROM magic_links ml JOIN members m ON m.id = ml.memberId WHERE ml.purpose = 'invite' ORDER BY ml.createdAt DESC LIMIT 20"
      ).all();
      return sendJson(res, 200, { members, invites });
    }

    // Create a member + invite link. The link is returned to the admin, who
    // shares it personally (no external sends).
    if (path === '/api/admin/invites' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const valid = (l) => ['en', 'ru', 'az'].includes(l);
      const main = valid(body.language) ? body.language : 'en';
      // All languages the member uses, main first (multi-language ruling).
      const extras = Array.isArray(body.languages) ? body.languages.filter(valid) : [];
      const languages = [...new Set([main, ...extras])].join(',');
      if (!name) return sendJson(res, 400, { error: 'name required' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { error: 'invalid email' });
      }
      if (email && findMemberByEmail(email)) {
        return sendJson(res, 400, { error: 'a member with this email already exists' });
      }
      const memberId = `p_${randomBytes(5).toString('hex')}`;
      db.prepare('INSERT INTO members (id, name, role, language, languages, email, joinedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(memberId, name, 'partner', main, languages, email || null, new Date().toISOString());
      const link = mintMagicLink(db, memberId, 'invite', new Date(), 7 * 24 * 60);
      logEvent(db, 'invite.created', { memberId, name, hasEmail: Boolean(email) });
      // With an email on file, the invitation email goes out immediately
      // (ruling 13); the link stays as a backup for members without email.
      let emailSent = false;
      if (email && emailConfigured()) {
        try {
          await sendWelcome({ to: email, name, language: main, url: url.origin });
          emailSent = true;
          logEvent(db, 'invite.email_sent', { memberId });
        } catch (err) {
          logEvent(db, 'invite.email_failed', { memberId, error: err.message });
        }
      }
      return sendJson(res, 200, { url: `${url.origin}/join/${link.token}`, memberId, email: email || null, emailSent, expiresAt: link.expiresAt });
    }

    // Edit a member's languages (main first).
    if (path === '/api/admin/members/languages' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(body.memberId || '');
      if (!member) return sendJson(res, 404, { error: 'member not found' });
      const valid = (l) => ['en', 'ru', 'az'].includes(l);
      const list = String(body.languages || '').split(',').map((s) => s.trim().toLowerCase()).filter(valid);
      if (!list.length) return sendJson(res, 400, { error: 'give a comma list from: en, ru, az' });
      const unique = [...new Set(list)];
      db.prepare('UPDATE members SET language = ?, languages = ? WHERE id = ?')
        .run(unique[0], unique.join(','), member.id);
      logEvent(db, 'member.languages_changed', { memberId: member.id, languages: unique.join(',') });
      return sendJson(res, 200, { ok: true, language: unique[0], languages: unique.join(',') });
    }

    // Ruling 23: per-member voice delivery preference for Otto's replies.
    if (path === '/api/admin/members/voicepref' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(body.memberId || '');
      if (!member) return sendJson(res, 404, { error: 'member not found' });
      if (!['auto', 'always', 'never'].includes(body.voicePref)) {
        return sendJson(res, 400, { error: 'voicePref must be auto, always, or never' });
      }
      db.prepare('UPDATE members SET voicePref = ? WHERE id = ?').run(body.voicePref, member.id);
      logEvent(db, 'member.voicepref_changed', { memberId: member.id, voicePref: body.voicePref });
      return sendJson(res, 200, { ok: true, voicePref: body.voicePref });
    }

    // Remove (retire) a member: never-delete rule, so data stays; the member
    // loses access (sessions retired, unused invites voided) and leaves the
    // active list. Admin-only; the admin cannot remove themselves.
    if (path === '/api/admin/members/remove' && req.method === 'POST') {
      const session = requireAdmin(req, res);
      if (!session) return;
      const body = await readJsonBody(req);
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(body.memberId || '');
      if (!member) return sendJson(res, 404, { error: 'member not found' });
      if (member.role === 'admin') return sendJson(res, 400, { error: 'the admin cannot be removed' });
      const now = new Date().toISOString();
      db.prepare("UPDATE members SET status = 'retired' WHERE id = ?").run(member.id);
      db.prepare("UPDATE sessions SET status = 'retired' WHERE memberId = ?").run(member.id);
      db.prepare('UPDATE magic_links SET usedAt = ? WHERE memberId = ? AND usedAt IS NULL').run(now, member.id);
      db.prepare("UPDATE push_subscriptions SET status = 'retired' WHERE memberId = ?").run(member.id);
      logEvent(db, 'member.retired', { memberId: member.id, name: member.name });
      return sendJson(res, 200, { ok: true });
    }

    // Corpus browser: full message rows including transcripts and translations.
    if (path === '/api/admin/messages' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const rows = db.prepare("SELECT * FROM messages ORDER BY ts DESC LIMIT 200").all();
      // The admin corpus view keeps original content even for deleted messages
      // (never-delete rule); the deleted flag marks them excluded from agents.
      return sendJson(res, 200, {
        messages: rows.map((m) => ({ ...messageView(db, m), originalText: m.originalText, status: m.status, deletedAt: m.deletedAt, transcript: m.transcript, transcriptAlt: m.transcriptAlt, transcriptConfidence: m.transcriptConfidence, language: m.language, englishText: m.englishText, pipelineStatus: m.pipelineStatus, pipelineError: m.pipelineError, tags: db.prepare('SELECT tag, confidence FROM tags WHERE messageId = ?').all(m.id) })),
      });
    }

    // Transcript correction: fixes the transcript and feeds the glossary.
    if (path === '/api/admin/correct-transcript' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(body.messageId || '');
      if (!msg) return sendJson(res, 404, { error: 'message not found' });
      const corrected = String(body.transcript || '').trim();
      if (!corrected) return sendJson(res, 400, { error: 'transcript required' });
      if (msg.transcript && corrected !== msg.transcript) {
        db.prepare('INSERT INTO glossary (memberId, wrong, right, addedAt) VALUES (?, ?, ?, ?)')
          .run(msg.senderId, msg.transcript.slice(0, 500), corrected.slice(0, 500), new Date().toISOString());
      }
      db.prepare('UPDATE messages SET transcript = ?, transcriptConfidence = 1 WHERE id = ?').run(corrected, msg.id);
      schedulePipeline(db, msg.id, { onBlock });
      logEvent(db, 'transcript.corrected', { messageId: msg.id });
      return sendJson(res, 200, { ok: true });
    }

    // ---------- Phase 2: corpus intelligence ----------
    // Semantic search over chunks and insights, with optional filters.
    if (path === '/api/admin/search' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return sendJson(res, 400, { error: 'query required' });
      const [queryVector] = await embedTexts(db, [q]);
      const tagFilter = url.searchParams.get('tag') || null;
      const ranked = rankChunks(db, queryVector, 60);
      const results = [];
      for (const r of ranked) {
        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(r.messageId);
        if (!msg || msg.status !== 'active') continue;
        const tags = db.prepare('SELECT tag, confidence FROM tags WHERE messageId = ?').all(msg.id);
        if (tagFilter && !tags.some((t) => t.tag === tagFilter || t.tag.startsWith(tagFilter + '/'))) continue;
        results.push({
          score: Number(r.score.toFixed(3)),
          chunkText: r.text,
          message: { ...messageView(db, msg), language: msg.language, englishText: msg.englishText, tags },
        });
        if (results.length >= 15) break;
      }
      // Insights matching the query, ranked the same way.
      const insightRows = db.prepare("SELECT * FROM insights WHERE status = 'active' AND embedding IS NOT NULL").all();
      const insights = insightRows
        .map((i) => ({
          id: i.id, text: i.text, tag: i.tag, weight: i.weight,
          sourceMessageIds: JSON.parse(i.sourceMessageIds),
          score: Number(cosine(Float32Array.from(queryVector), blobToVector(i.embedding)).toFixed(3)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      return sendJson(res, 200, { results, insights });
    }

    if (path === '/api/admin/insights' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const rows = db.prepare("SELECT * FROM insights WHERE status = 'active' ORDER BY id DESC LIMIT 100").all();
      const memberNames = new Map(db.prepare('SELECT id, name FROM members').all().map((m) => [m.id, m.name]));
      return sendJson(res, 200, {
        insights: rows.map((i) => ({
          id: i.id, text: i.text, tag: i.tag, weight: i.weight, extractedAt: i.extractedAt,
          sources: JSON.parse(i.sourceMessageIds).map((mid) => {
            const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(mid);
            return m ? { id: mid, sender: memberNames.get(m.senderId) || m.senderId, text: (m.englishText || m.originalText || m.transcript || '').slice(0, 160), ts: m.ts } : { id: mid };
          }),
        })),
        lastRunAt: getSetting(db, 'insightsLastRunAt', null),
      });
    }

    if (path === '/api/admin/insights/run' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      try {
        const result = await runExtraction(db, { onBlock });
        // Event trigger (spec 7b): themes crossing the threshold refresh the
        // Opportunity Register without waiting for the weekly run.
        maybeEventUpdate(db, { onBlock }).catch(() => {});
        return sendJson(res, 200, result);
      } catch (err) {
        if (err.code === 'SPEND_BLOCKED') return sendJson(res, 409, { error: 'spend ceiling reached; unblock first' });
        logEvent(db, 'insights.error', { error: err.message });
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (path === '/api/admin/taxonomy' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, {
        tags: [...validTags(db)].sort(),
        proposals: db.prepare("SELECT * FROM taxonomy_proposals ORDER BY id DESC LIMIT 50").all(),
      });
    }

    if (path === '/api/admin/taxonomy/decide' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const row = db.prepare('SELECT * FROM taxonomy_proposals WHERE id = ?').get(Number(body.id));
      if (!row || row.status !== 'pending') return sendJson(res, 404, { error: 'proposal not found or already decided' });
      const status = body.approve ? 'approved' : 'rejected';
      db.prepare('UPDATE taxonomy_proposals SET status = ? WHERE id = ?').run(status, row.id);
      logEvent(db, 'taxonomy.decided', { tag: row.tag, status });
      return sendJson(res, 200, { ok: true, status });
    }

    // ---------- Phase 4: Bob ----------
    if (path === '/api/admin/bob-chat' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { messages: bobChatHistory(db) });
    }
    if (path === '/api/admin/bob-chat' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const text = String(body.text || '').trim();
      if (!text) return sendJson(res, 400, { error: 'empty message' });
      try {
        const reply = await bobChat(db, text, { onBlock });
        return sendJson(res, 200, { reply });
      } catch (err) {
        if (err.code === 'SPEND_BLOCKED') return sendJson(res, 409, { error: 'spend ceiling reached; unblock first' });
        logEvent(db, 'bob.chat_error', { error: err.message });
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (path === '/api/admin/otto-chat' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { messages: ottoChatHistory(db) });
    }
    if (path === '/api/admin/otto-chat' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const text = String(body.text || '').trim();
      if (!text) return sendJson(res, 400, { error: 'empty message' });
      try {
        const reply = await ottoChat(db, text, { onBlock });
        return sendJson(res, 200, { reply });
      } catch (err) {
        if (err.code === 'SPEND_BLOCKED') return sendJson(res, 409, { error: 'spend ceiling reached; unblock first' });
        logEvent(db, 'otto.chat_error', { error: err.message });
        return sendJson(res, 500, { error: err.message });
      }
    }
    if (path === '/api/admin/otto/directives' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { directives: getOttoDirectives(db) });
    }
    if (path === '/api/admin/otto/directives/remove' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      removeOttoDirective(db, Number(body.index));
      return sendJson(res, 200, { ok: true, directives: getOttoDirectives(db) });
    }

    if (path === '/api/admin/bob/directives' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { directives: getBobDirectives(db) });
    }
    if (path === '/api/admin/bob/directives/remove' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      removeBobDirective(db, Number(body.index));
      return sendJson(res, 200, { ok: true, directives: getBobDirectives(db) });
    }

    if (path === '/api/admin/mark-chat' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { messages: markChatHistory(db) });
    }
    if (path === '/api/admin/mark-chat' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const text = String(body.text || '').trim();
      if (!text) return sendJson(res, 400, { error: 'empty message' });
      try {
        const reply = await markChat(db, text, { onBlock });
        return sendJson(res, 200, { reply });
      } catch (err) {
        if (err.code === 'SPEND_BLOCKED') return sendJson(res, 409, { error: 'spend ceiling reached; unblock first' });
        logEvent(db, 'mark.chat_error', { error: err.message });
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Voice questions to Bob/Mark: raw audio in, transcript out. The audio is
    // retained under the never-delete rule; the transcript goes back to the
    // dashboard, which submits it as a normal chat message.
    if (path === '/api/admin/transcribe' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') || mime.includes('3gpp') ? 'm4a' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : null;
      if (!ext) return sendJson(res, 400, { error: `unsupported audio type (${mime || 'none'})` });
      let buf;
      try {
        buf = await readBody(req, MAX_AUDIO_BYTES);
      } catch {
        return sendJson(res, 413, { error: 'audio too large' });
      }
      if (!buf.length) return sendJson(res, 400, { error: 'empty audio' });
      const stored = storeFile(dataDir, 'audio', ext, buf);
      try {
        const result = await transcribe(db, { audioPath: stored.path });
        return sendJson(res, 200, { text: result.text });
      } catch (err) {
        return sendJson(res, 500, { error: `transcription failed: ${err.message}` });
      }
    }

    if (path === '/api/admin/documents' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { documents: getDocuments(db) });
    }
    if (path.startsWith('/api/admin/documents/') && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const doc = getDocument(db, decodeURIComponent(path.split('/').pop()));
      if (!doc) return sendJson(res, 404, { error: 'no versions yet' });
      return sendJson(res, 200, { type: doc.type, version: doc.version, at: doc.at, createdBy: doc.createdBy, content: doc.content, provenance: doc.provenance, versions: doc.versions });
    }
    if (path === '/api/admin/documents/run' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      try {
        if (body.type === 'all') {
          const results = await weeklySynthesis(db, { onBlock });
          return sendJson(res, 200, { ok: true, results });
        }
        if (body.type === 'digest') {
          const digest = await nightlyDigest(db, { onBlock });
          return sendJson(res, 200, { ok: true, ran: Boolean(digest) });
        }
        if (!DOCUMENT_TYPES.includes(body.type)) return sendJson(res, 400, { error: 'unknown document type' });
        const result = await generateDocument(db, body.type, { onBlock });
        return sendJson(res, 200, { ok: true, version: result.version });
      } catch (err) {
        if (err.code === 'SPEND_BLOCKED') return sendJson(res, 409, { error: 'spend ceiling reached; unblock first' });
        logEvent(db, 'bob.run_error', { error: err.message });
        return sendJson(res, 500, { error: err.message });
      }
    }

    // ---------- Phase 5: Mark + agent requests ----------
    if (path === '/api/admin/mark/run' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      try {
        if (body.topic) {
          const r = await runMarkCustom(db, String(body.topic).slice(0, 400), { onBlock });
          return sendJson(res, 200, { ok: true, version: r.version });
        }
        if (body.type === 'all') {
          const results = await runMarkAll(db, { onBlock });
          return sendJson(res, 200, { ok: true, results });
        }
        if (!MARK_DOC_TYPES.includes(body.type)) return sendJson(res, 400, { error: 'unknown market document' });
        const r = await runMarkDocument(db, body.type, { onBlock });
        return sendJson(res, 200, { ok: true, version: r.version });
      } catch (err) {
        if (err.code === 'SPEND_BLOCKED') return sendJson(res, 409, { error: 'spend ceiling reached; unblock first' });
        logEvent(db, 'mark.run_error', { error: err.message });
        return sendJson(res, 500, { error: err.message });
      }
    }
    if (path === '/api/admin/mark/queue' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { queue: getQueue(db), directives: getDirectives(db) });
    }
    if (path === '/api/admin/mark/directives/remove' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      removeDirective(db, Number(body.index));
      return sendJson(res, 200, { ok: true, directives: getDirectives(db) });
    }

    if (path === '/api/admin/agent-requests' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, {
        requests: db.prepare('SELECT * FROM agent_requests ORDER BY id DESC LIMIT 50').all(),
      });
    }
    // The admin can answer or cancel any queued request by hand (spec 7b).
    if (path === '/api/admin/agent-requests/answer' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const row = db.prepare('SELECT * FROM agent_requests WHERE id = ?').get(Number(body.id));
      if (!row || !['open', 'declined'].includes(row.status)) return sendJson(res, 404, { error: 'request not open' });
      const answer = String(body.answer || '').trim();
      if (!answer) return sendJson(res, 400, { error: 'answer required' });
      const refs = JSON.parse(row.contextRefs);
      const src = refs.length ? db.prepare('SELECT * FROM messages WHERE id = ?').get(refs[0]) : null;
      const language = src?.language || 'en';
      const memberName = src ? db.prepare('SELECT name FROM members WHERE id = ?').get(src.senderId)?.name : 'the member';
      answerAgentRequest(db, row.id, answer, 'answered');
      const relay = await generateRelay(db, { toAgent: row.toAgent, answer, language, memberName }, { onBlock });
      if (relay) {
        await postOttoMessage(relay, { language });
        answerAgentRequest(db, row.id, answer, 'relayed');
      }
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/api/admin/agent-requests/cancel' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      db.prepare("UPDATE agent_requests SET status = 'declined', answeredAt = ? WHERE id = ? AND status = 'open'")
        .run(new Date().toISOString(), Number(body.id));
      return sendJson(res, 200, { ok: true });
    }

    // ---------- Phase 6: tool registry ----------
    if (path === '/api/admin/tools' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { tools: listTools(db) });
    }
    if (path === '/api/admin/tools' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      try {
        const name = registerTool(db, body);
        return sendJson(res, 200, { ok: true, name });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (path === '/api/admin/tools/remove' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      retireTool(db, body.id);
      return sendJson(res, 200, { ok: true });
    }

    // ---------- Phase 6: knowledge upload ----------
    if (path === '/api/admin/knowledge' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, { knowledge: listKnowledge(db) });
    }
    if (path === '/api/admin/knowledge/file' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const fileName = decodeURIComponent(req.headers['x-file-name'] || 'upload.txt');
      let buf;
      try {
        buf = await readBody(req, MAX_FILE_BYTES);
      } catch {
        return sendJson(res, 413, { error: 'file too large' });
      }
      try {
        const stored = storeFile(dataDir, 'knowledge', fileName.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin', buf);
        const result = await addKnowledgeFile(db, { title: fileName, path: stored.path, buf, fileName });
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (path === '/api/admin/knowledge/note' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      if (!body.title || !body.text) return sendJson(res, 400, { error: 'title and text required' });
      try {
        const result = await addKnowledgeNote(db, { title: String(body.title).slice(0, 150), text: body.text });
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (path === '/api/admin/knowledge/link' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      try {
        const result = await addKnowledgeLink(db, { url: String(body.url || '').trim() });
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (path === '/api/admin/knowledge/remove' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      retireKnowledge(db, body.id);
      return sendJson(res, 200, { ok: true });
    }

    // Pre-launch test data wipe (founder ruling 16). Admin-only, requires the
    // exact confirmation phrase. Keeps: admin account + sessions, Knowledge
    // library and its kn: index, spend history, settings/directives, events.
    if (path === '/api/admin/reset-test-data' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      if (body.confirm !== 'DELETE ALL TEST DATA') {
        return sendJson(res, 400, { error: 'confirmation phrase mismatch' });
      }
      const counts = {};
      const del = (label, sql) => { counts[label] = db.prepare(sql).run().changes; };
      del('messages', 'DELETE FROM messages');
      del('tags', 'DELETE FROM tags');
      del('chunks', "DELETE FROM chunks WHERE messageId NOT LIKE 'kn:%'");
      del('insights', 'DELETE FROM insights');
      del('glossary', 'DELETE FROM glossary');
      del('agent_requests', 'DELETE FROM agent_requests');
      del('agent_chat', 'DELETE FROM agent_chat');
      del('bob_chat_legacy', 'DELETE FROM bob_chat');
      del('documents', 'DELETE FROM documents');
      del('taxonomy_proposals', 'DELETE FROM taxonomy_proposals');
      del('login_codes', 'DELETE FROM login_codes');
      del('magic_links', 'DELETE FROM magic_links');
      del('sessions', "DELETE FROM sessions WHERE memberId != 'admin'");
      del('push_subscriptions', "DELETE FROM push_subscriptions WHERE memberId != 'admin'");
      del('members', "DELETE FROM members WHERE role != 'admin'");
      for (const key of ['ottoState', 'insightsProcessedUpTo', 'insightsLastRunAt',
        'bobSynthesisLastRunAt', 'bobWeeklyLastRunAt', 'bobDigestLastRunAt',
        'markWeeklyLastRunAt', 'markQueue']) {
        db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      }
      // Test media on disk (knowledge/ is kept).
      let filesRemoved = 0;
      for (const sub of ['audio', 'files']) {
        const dir = join(dataDir, sub);
        if (existsSync(dir)) {
          for (const f of readdirSync(dir)) {
            try { unlinkSync(join(dir, f)); filesRemoved++; } catch {}
          }
        }
      }
      counts.mediaFiles = filesRemoved;
      logEvent(db, 'admin.test_data_wiped', counts);
      return sendJson(res, 200, { ok: true, deleted: counts });
    }

    // ---------- Agent controls (Phase 3) ----------
    if (path === '/api/admin/agent-settings' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const s = ottoSettings(db);
      return sendJson(res, 200, {
        ottoMuted: s.muted, ottoCap: s.cap, ottoProactivePerDay: s.proactivePerDay,
        ottoSpacingHours: s.spacingHours, ottoResetMin: s.resetMin,
        ottoVoice: s.voice, ottoVoiceLangs: s.voiceLangs.join(','),
        ottoEscalate: s.escalate, ottoEscalateAfter: s.escalateAfter,
        bobFable: getSetting(db, 'bobFable', '0') === '1',
        digestHourCT: Number(getSetting(db, 'digestHourCT', 22)),
        synthesisHourCT: Number(getSetting(db, 'synthesisHourCT', 23)),
        synthesisMinMessages: Number(getSetting(db, 'synthesisMinMessages', 3)),
        synthesisMinInsights: Number(getSetting(db, 'synthesisMinInsights', 1)),
        insightsIntervalHours: Number(getSetting(db, 'insightsIntervalHours', 6)),
        markRefreshDays: Number(getSetting(db, 'markRefreshDays', 7)),
      });
    }
    if (path === '/api/admin/agent-settings' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      if (body.ottoMuted !== undefined) setSetting(db, 'ottoMuted', body.ottoMuted ? '1' : '0');
      if (Number.isFinite(Number(body.ottoCap)) && Number(body.ottoCap) >= 1) setSetting(db, 'ottoCap', Number(body.ottoCap));
      if (Number.isFinite(Number(body.ottoProactivePerDay)) && Number(body.ottoProactivePerDay) >= 0) setSetting(db, 'ottoProactivePerDay', Number(body.ottoProactivePerDay));
      if (typeof body.ottoVoiceLangs === 'string') {
        setSetting(db, 'ottoVoiceLangs', body.ottoVoiceLangs.split(',').map((s) => s.trim()).filter((l) => ['en', 'ru', 'az'].includes(l)).join(','));
      }
      if (body.bobFable !== undefined) setSetting(db, 'bobFable', body.bobFable ? '1' : '0');
      if (body.ottoEscalate !== undefined) setSetting(db, 'ottoEscalate', body.ottoEscalate ? '1' : '0');
      const numeric = {
        ottoSpacingHours: [1, 24], ottoResetMin: [10, 240], ottoEscalateAfter: [2, 10],
        digestHourCT: [0, 23], synthesisHourCT: [0, 23],
        synthesisMinMessages: [1, 50], synthesisMinInsights: [0, 20],
        insightsIntervalHours: [1, 72], markRefreshDays: [1, 30],
      };
      for (const [key, [min, max]] of Object.entries(numeric)) {
        const v = Number(body[key]);
        if (body[key] !== undefined && Number.isFinite(v) && v >= min && v <= max) setSetting(db, key, v);
      }
      if (typeof body.ottoVoice === 'string' && ['echo', 'onyx', 'ash', 'verse', 'ballad', 'cedar', 'marin'].includes(body.ottoVoice)) {
        setSetting(db, 'ottoVoice', body.ottoVoice);
      }
      logEvent(db, 'otto.settings_changed', null);
      return sendJson(res, 200, { ok: true });
    }

    if (path === '/api/admin/spend' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, 200, spendSummary(db));
    }
    if (path === '/api/admin/spend/ceiling' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const usd = Number(body.usd);
      if (!Number.isFinite(usd) || usd <= 0) return sendJson(res, 400, { error: 'invalid ceiling' });
      setCeiling(db, usd);
      logEvent(db, 'spend.ceiling.changed', { usd });
      return sendJson(res, 200, { ok: true });
    }
    if (path === '/api/admin/spend/unblock' && req.method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (isBlocked(db)) {
        unblock(db);
        postAndBroadcast(db, {
          senderId: 'system', senderKind: 'system', kind: 'text', pipelineStatus: 'done', language: 'en',
          originalText: 'Rashad unblocked the assistants. Back to work.\nRashad razblokiroval assistentov.\nRashad assistentleri yeniden ishe saldi.',
        });
      }
      return sendJson(res, 200, { ok: true });
    }

    // ---------- Pages ----------
    if (path === '/chat' || path === '/chat/') {
      const session = currentSession(req);
      if (!session) return redirect(res, '/login');
      return serveFile(res, join(root, 'public', 'chat', 'index.html'));
    }
    if (path === '/admin' || path === '/admin/') {
      const session = currentSession(req);
      if (!session || session.role !== 'admin') return redirect(res, '/login');
      return serveFile(res, join(root, 'public', 'admin', 'index.html'));
    }
    if (path === '/') {
      const session = currentSession(req);
      if (session?.role === 'admin') return redirect(res, '/admin');
      return redirect(res, '/chat');
    }

    // Static assets.
    const staticPath = normalize(join(root, 'public', path));
    if (staticPath.startsWith(join(root, 'public')) && existsSync(staticPath) && statSync(staticPath).isFile()) {
      return serveFile(res, staticPath);
    }

    return send(res, 404, 'Not found');
  } catch (err) {
    console.error('request error:', err.message);
    return send(res, 500, 'Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Repair AI listening on port ${PORT}`);
});

// Daily insight extraction: checked hourly, runs when there is new material
// and the previous run is old enough (lib/insights.mjs). A completed run can
// event-trigger Bob's Opportunity Register update.
setInterval(async () => {
  try {
    const ran = await maybeRunScheduled(db, { onBlock });
    if (ran) await maybeEventUpdate(db, { onBlock });
  } catch {}
}, 60 * 60 * 1000);

// Bob's clocks: nightly digest around 03:00 UTC, daily full synthesis around
// 04:00 UTC gated on the day's substance (ruling 15), with extraction catch-up
// first so the gate judges real insights.
setInterval(() => {
  maybeRunBobSchedules(db, {
    onBlock,
    catchUpExtraction: async () => {
      let guard = 0;
      while (guard++ < 5) {
        const result = await runExtraction(db, { onBlock });
        if (!result.processed) break;
      }
    },
  }).catch(() => {});
}, 60 * 60 * 1000);

// Mark's clock: weekly research refresh, and queued topics between runs.
setInterval(() => {
  maybeRunMarkWeekly(db, { onBlock }).catch(() => {});
}, 60 * 60 * 1000);

// Otto's proactive interventions: checked every 5 minutes, gated by the daily
// budget, spacing, and the 10-minute lull rule (spec Section 5).
setInterval(async () => {
  try {
    const gate = canIntervene(db);
    if (!gate.ok) return;
    const question = await generateIntervention(db, { onBlock });
    if (!question) return;
    recordIntervention(db);
    await postOttoMessage(question, { language: null });
    logEvent(db, 'otto.intervened', null);
  } catch (err) {
    if (err.code !== 'SPEND_BLOCKED') logEvent(db, 'otto.intervention_error', { error: err.message });
  }
}, 5 * 60 * 1000);
