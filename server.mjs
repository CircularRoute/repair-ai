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
  mintMagicLink, consumeMagicLink, sessionCookieHeader, clearCookieHeader, readCookies,
} from './lib/auth.mjs';
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

// Serve a stored file safely: confined to dataDir, download-only, nosniff.
function serveStoredFile(res, filePath, { fileName, mime, inlineAudio = false }) {
  const resolved = normalize(filePath);
  if (!resolved.startsWith(normalize(dataDir)) || !existsSync(resolved)) {
    return send(res, 404, 'Not found');
  }
  const headers = {
    'Content-Type': mime || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': inlineAudio
      ? 'inline'
      : `attachment; filename="${(fileName || 'file').replace(/[^\w.\- ]/g, '_')}"`,
  };
  res.writeHead(200, headers);
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
      const now = new Date().toISOString();
      if (!member.consentShownAt) {
        db.prepare('UPDATE members SET consentShownAt = ?, joinedAt = ? WHERE id = ?').run(now, now, member.id);
        // Otto onboarding: greeting + consent + one warm question, in the
        // member's language. Delivered exactly once, on first join.
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
      return sendJson(res, 200, { ok: true, name: member.name }, {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, { secure: SECURE_COOKIES }),
      });
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
      const rows = after
        ? db.prepare("SELECT * FROM messages WHERE status = 'active' AND ts > ? ORDER BY ts LIMIT 200").all(after)
        : db.prepare("SELECT * FROM messages WHERE status = 'active' ORDER BY ts DESC LIMIT 100").all().reverse();
      return sendJson(res, 200, { messages: rows.map((m) => messageView(db, m)) });
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
      if (!msg) return send(res, 404, 'Not found');
      if (msg.audioPath) {
        const ext = msg.audioPath.split('.').pop();
        return serveStoredFile(res, msg.audioPath, { mime: AUDIO_MIME[ext] || 'audio/mpeg', inlineAudio: true });
      }
      if (msg.filePath) {
        return serveStoredFile(res, msg.filePath, { fileName: msg.fileName, mime: msg.fileMime });
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
      const members = db.prepare("SELECT id, name, role, language, status, joinedAt, consentShownAt FROM members ORDER BY joinedAt").all();
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
      const language = ['en', 'ru', 'az'].includes(body.language) ? body.language : 'en';
      if (!name) return sendJson(res, 400, { error: 'name required' });
      const memberId = `p_${randomBytes(5).toString('hex')}`;
      db.prepare('INSERT INTO members (id, name, role, language, joinedAt) VALUES (?, ?, ?, ?, ?)')
        .run(memberId, name, 'partner', language, new Date().toISOString());
      const link = mintMagicLink(db, memberId, 'invite', new Date(), 7 * 24 * 60);
      logEvent(db, 'invite.created', { memberId, name });
      return sendJson(res, 200, { url: `${url.origin}/join/${link.token}`, memberId, expiresAt: link.expiresAt });
    }

    // Corpus browser: full message rows including transcripts and translations.
    if (path === '/api/admin/messages' && req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const rows = db.prepare("SELECT * FROM messages ORDER BY ts DESC LIMIT 200").all();
      return sendJson(res, 200, {
        messages: rows.map((m) => ({ ...messageView(db, m), transcript: m.transcript, transcriptAlt: m.transcriptAlt, transcriptConfidence: m.transcriptConfidence, language: m.language, englishText: m.englishText, pipelineStatus: m.pipelineStatus, pipelineError: m.pipelineError })),
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
