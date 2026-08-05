// Repair AI - single service, no framework. Phase 1: member chat PWA (text, voice,
// allowlisted attachments), invite flow, capture pipeline, push notifications,
// spend meter with the $20/day ceiling, Otto onboarding-only.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { loadEnv, requireEnv } from './lib/env.mjs';
import { openDb, ensureAdminMember, logEvent, resolveDataDir, getSetting } from './lib/db.mjs';
import {
  SESSION_COOKIE, safeEqual, createSession, getSession, retireSession,
  mintMagicLink, consumeMagicLink, mintLoginCode, consumeLoginCode,
  sessionCookieHeader, clearCookieHeader, readCookies,
} from './lib/auth.mjs';
import { sendLoginCode, emailConfigured } from './lib/email.mjs';
import {
  validateAttachment, storeFile, MAX_FILE_BYTES, MAX_AUDIO_BYTES, ALLOWED_EXTENSIONS,
} from './lib/files.mjs';
import { schedule as schedulePipeline } from './lib/pipeline.mjs';
import {
  addSseClient, postAndBroadcast, messageView, makeCeilingBlockHandler, broadcast,
} from './lib/chat.mjs';
import { spendSummary, setCeiling, unblock, isBlocked } from './lib/spend.mjs';
import { configurePush, vapidPublicKey, saveSubscription, notifyMembers } from './lib/push.mjs';
import { OTTO_ID, onboardingMessage } from './lib/otto.mjs';

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

function postMemberMessage(session, fields) {
  const msg = postAndBroadcast(db, { senderId: session.memberId, senderKind: 'member', ...fields });
  schedulePipeline(db, msg.id, { onBlock });
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
      const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : null;
      if (!ext) return sendJson(res, 400, { error: 'unsupported audio type' });
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

    // ---------- Admin APIs ----------
    if (path === '/api/admin/members' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const members = db.prepare("SELECT id, name, role, language, languages, email, status, joinedAt, consentShownAt FROM members ORDER BY joinedAt").all();
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
      return sendJson(res, 200, { url: `${url.origin}/join/${link.token}`, memberId, email: email || null, expiresAt: link.expiresAt });
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
        messages: rows.map((m) => ({ ...messageView(db, m), originalText: m.originalText, status: m.status, deletedAt: m.deletedAt, transcript: m.transcript, transcriptAlt: m.transcriptAlt, transcriptConfidence: m.transcriptConfidence, language: m.language, englishText: m.englishText, pipelineStatus: m.pipelineStatus, pipelineError: m.pipelineError })),
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
