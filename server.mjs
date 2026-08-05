// Repair AI - single service, no framework. Phase 0: env wiring, SQLite skeleton,
// magic-link auth skeleton, admin PWA shell. Later phases add the chat PWA, capture
// pipeline, and the Otto/Bob/Mark agents per the spec.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { loadEnv, requireEnv } from './lib/env.mjs';
import { openDb, ensureAdminMember, logEvent } from './lib/db.mjs';
import {
  SESSION_COOKIE,
  safeEqual,
  createSession,
  getSession,
  retireSession,
  mintMagicLink,
  consumeMagicLink,
  sessionCookieHeader,
  clearCookieHeader,
  readCookies,
} from './lib/auth.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const { path: envPath } = loadEnv();
console.log('env file path in use (values never logged):', envPath);
requireEnv(['REPAIR_ADMIN_TOKEN']);

const db = openDb();
const adminId = ensureAdminMember(db);
const PORT = Number(process.env.PORT || 8790);
// Cookies are Secure in production (Render is always https); plain http locally.
const SECURE_COOKIES = process.env.NODE_ENV === 'production';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
}

function redirect(res, location, headers = {}) {
  send(res, 302, '', { Location: location, ...headers });
}

function serveFile(res, filePath, extraHeaders = {}) {
  const type = MIME[extname(filePath)] || 'application/octet-stream';
  send(res, 200, readFileSync(filePath), { 'Content-Type': type, ...extraHeaders });
}

async function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolvePromise(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function currentSession(req) {
  const cookies = readCookies(req.headers.cookie);
  return getSession(db, cookies[SESSION_COOKIE]);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  try {
    if (path === '/healthz') {
      return sendJson(res, 200, { ok: true, service: 'repair-ai' });
    }

    // Login page: the founder exchanges the admin token for a session, once per
    // device. Members will get invite magic links instead (Phase 1).
    if (path === '/login' && req.method === 'GET') {
      return serveFile(res, join(root, 'public', 'login.html'));
    }

    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!safeEqual(body.token || '', process.env.REPAIR_ADMIN_TOKEN)) {
        logEvent(db, 'auth.login.denied', null);
        return sendJson(res, 401, { error: 'invalid token' });
      }
      const session = createSession(db, adminId);
      logEvent(db, 'auth.login.ok', { memberId: adminId });
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, {
          secure: SECURE_COOKIES,
        }),
      });
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      const session = currentSession(req);
      if (session) retireSession(db, session.id);
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': clearCookieHeader({ secure: SECURE_COOKIES }),
      });
    }

    // Mint a single-use magic link (admin only). Returned to the admin in the
    // dashboard; nothing is emailed or sent anywhere, per the no-external-sends rule.
    if (path === '/api/auth/magic-link' && req.method === 'POST') {
      const session = currentSession(req);
      if (!session || session.role !== 'admin') {
        return sendJson(res, 401, { error: 'admin session required' });
      }
      const link = mintMagicLink(db, session.memberId, 'login');
      logEvent(db, 'auth.magiclink.minted', { memberId: session.memberId });
      return sendJson(res, 200, {
        url: `${url.origin.replace('http://', SECURE_COOKIES ? 'https://' : 'http://')}/a/${link.token}`,
        expiresAt: link.expiresAt.toISOString(),
      });
    }

    // Consume a magic link: single use, expiring, sets a session cookie.
    if (path.startsWith('/a/') && req.method === 'GET') {
      const consumed = consumeMagicLink(db, path.slice(3));
      if (!consumed) return send(res, 410, 'This link is no longer valid.');
      const session = createSession(db, consumed.memberId);
      logEvent(db, 'auth.magiclink.used', { memberId: consumed.memberId });
      return redirect(res, '/admin', {
        'Set-Cookie': sessionCookieHeader(session.id, session.expiresAt, {
          secure: SECURE_COOKIES,
        }),
      });
    }

    if (path === '/api/me') {
      const session = currentSession(req);
      if (!session) return sendJson(res, 401, { error: 'not logged in' });
      return sendJson(res, 200, {
        memberId: session.memberId,
        name: session.name,
        role: session.role,
      });
    }

    // Admin dashboard shell, session-gated.
    if (path === '/admin' || path === '/admin/') {
      const session = currentSession(req);
      if (!session || session.role !== 'admin') return redirect(res, '/login');
      return serveFile(res, join(root, 'public', 'admin', 'index.html'));
    }

    if (path === '/') return redirect(res, '/admin');

    // Static assets under /public. Path traversal blocked by normalize + prefix check.
    const staticPath = normalize(join(root, 'public', path));
    if (
      staticPath.startsWith(join(root, 'public')) &&
      existsSync(staticPath) &&
      statSync(staticPath).isFile()
    ) {
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
