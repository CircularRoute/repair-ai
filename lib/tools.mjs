// Phase 6: the admin tool registry and the plumbing that lets Bob invoke
// registered APIs as tools in chat. Structured facts are tool calls, never
// prose in prompts (spec Section 12). Secrets live in env vars referenced by
// NAME; only the admin registers tools; calls are read-only (GET) in v1.

import { logEvent } from './db.mjs';

export function listTools(db, { includeRetired = false } = {}) {
  return db
    .prepare(`SELECT * FROM tools ${includeRetired ? '' : "WHERE status = 'active'"} ORDER BY id`)
    .all()
    .map((t) => ({ ...t, hasKey: t.authType === 'none' || Boolean(process.env[t.authEnvVar || '']) }));
}

export function registerTool(db, { name, description, baseUrl, authType = 'none', authEnvVar = null, authParamName = null }) {
  const clean = String(name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 40);
  if (!clean) throw new Error('tool name required');
  if (!/^https:\/\/[^\s]+$/.test(String(baseUrl || ''))) throw new Error('baseUrl must be a full https:// URL');
  if (!String(description || '').trim()) throw new Error('description required (Bob decides from it when to call)');
  if (['bearer', 'header', 'query'].includes(authType) && !/^[A-Z][A-Z0-9_]*$/.test(String(authEnvVar || ''))) {
    throw new Error('authEnvVar must be an ENV_VAR_NAME (the key itself goes in the env file / Render, never here)');
  }
  db.prepare(
    'INSERT INTO tools (name, description, baseUrl, authType, authEnvVar, authParamName, at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(clean, String(description).slice(0, 500), baseUrl.replace(/\/$/, ''), authType, authEnvVar, authParamName, new Date().toISOString());
  logEvent(db, 'tool.registered', { name: clean, baseUrl });
  return clean;
}

export function retireTool(db, id) {
  db.prepare("UPDATE tools SET status = 'retired' WHERE id = ?").run(Number(id));
  logEvent(db, 'tool.retired', { id });
}

// Anthropic custom-tool definitions for Bob's chat, one per registered tool.
export function toolDefinitions(db) {
  return listTools(db).filter((t) => t.hasKey).map((t) => ({
    name: t.name,
    description:
      `${t.description} Read-only HTTP GET against ${t.baseUrl}. ` +
      'Call with a path (starting with /) and optional query parameters.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Request path starting with /, appended to the base URL' },
        query: { type: 'object', description: 'Optional query parameters as key-value strings' },
      },
      required: ['path'],
    },
  }));
}

// Executes one registered tool call. GET only, pinned to the registered base
// URL, auth injected from the named env var, response truncated. The key is
// never logged and never returned to the model beyond the API's own response.
export async function invokeTool(db, name, input) {
  const tool = db.prepare("SELECT * FROM tools WHERE name = ? AND status = 'active'").get(name);
  if (!tool) return { ok: false, error: `unknown tool ${name}` };
  const path = String(input?.path || '/');
  if (!path.startsWith('/') || path.includes('..')) return { ok: false, error: 'path must start with / and contain no ..' };

  const url = new URL(tool.baseUrl + path);
  if (!url.href.startsWith(tool.baseUrl)) return { ok: false, error: 'path escapes the registered base URL' };
  if (input?.query && typeof input.query === 'object') {
    for (const [k, v] of Object.entries(input.query)) url.searchParams.set(String(k).slice(0, 60), String(v).slice(0, 200));
  }

  const headers = { Accept: 'application/json' };
  const key = tool.authEnvVar ? process.env[tool.authEnvVar] : null;
  if (tool.authType !== 'none' && !key) return { ok: false, error: `env var ${tool.authEnvVar} is not set on the server` };
  if (tool.authType === 'bearer') headers.Authorization = `Bearer ${key}`;
  if (tool.authType === 'header') headers[tool.authParamName || 'X-API-Key'] = key;
  if (tool.authType === 'query') url.searchParams.set(tool.authParamName || 'api_key', key);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timer);
    let body = await res.text();
    try {
      body = JSON.stringify(JSON.parse(body), null, 1);
    } catch {}
    logEvent(db, 'tool.invoked', { name, path, status: res.status });
    return { ok: res.ok, status: res.status, body: body.slice(0, 4000) };
  } catch (err) {
    logEvent(db, 'tool.invoke_failed', { name, path, error: err.message });
    return { ok: false, error: `request failed: ${err.message}` };
  }
}
