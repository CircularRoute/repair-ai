// Mark (spec Section 7): market and targeting research. Sonnet 5 plus the
// server-side web search tool. Weekly on schedule, on demand from the
// dashboard, and via the check-with queue. Every claim cites a URL. The
// property-manager channel is the priority research area. Mark never posts in
// the group; his documents land in the shared corpus for Bob and Otto.

import { complete, untrusted, MODELS, WEB_SEARCH_TOOL, BOUNDARY_NOTE } from './claude.mjs';
import { saveDocument, indexDocument, markTriggeredUpdate } from './bob.mjs';
import { rankChunks, embedTexts } from './embeddings.mjs';
import { getSetting, setSetting, logEvent } from './db.mjs';
import { notifyAdmin } from './push.mjs';

export const MARK_DOC_TYPES = ['market-landscape', 'competitor-tracker', 'targeting-icp', 'channel-opportunities'];

const MARK_SYSTEM_BASE =
  'You are Mark, the market and targeting analyst for Repair AI, which is building products for the appliance ' +
  'repair industry: a growth engine for repair businesses (property managers as a channel FIRST, consumers ' +
  'second) and an operations autopilot for repair shops and one-person repair businesses. ' +
  'Your research feeds Bob (the synthesis agent) and the founder Rashad.\n' +
  'HARD RULES: Every factual claim carries its source URL inline. Use web search for anything current; never ' +
  'invent companies, prices, or numbers. Distinguish verified facts from your assessments. Write concise ' +
  'markdown. The PROPERTY-MANAGER CHANNEL is your priority research area: how property managers, landlords, ' +
  'and multi-unit operators buy repair services, who decides, what contracts look like, what would make them ' +
  'route volume to one repairer, and how to reach them. No em dashes. ' +
  BOUNDARY_NOTE;

// Standing instructions from the admin (dashboard only, ruling 7): they shape
// every Mark run until removed.
export function getDirectives(db) {
  return JSON.parse(getSetting(db, 'markDirectives', '[]'));
}

export function addDirective(db, text) {
  const list = getDirectives(db);
  list.push(text.slice(0, 400));
  setSetting(db, 'markDirectives', JSON.stringify(list.slice(-15)));
  logEvent(db, 'mark.directive_added', { text: text.slice(0, 120) });
}

export function removeDirective(db, index) {
  const list = getDirectives(db);
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    setSetting(db, 'markDirectives', JSON.stringify(list));
    logEvent(db, 'mark.directive_removed', { index });
  }
}

function markSystem(db) {
  const directives = getDirectives(db);
  return MARK_SYSTEM_BASE + (directives.length
    ? '\nSTANDING INSTRUCTIONS FROM RASHAD (set via his dashboard; follow them in all work):\n' +
      directives.map((d, i) => `${i + 1}. ${d}`).join('\n')
    : '');
}

const DOC_PROMPTS = {
  'market-landscape':
    'Write the MARKET LANDSCAPE document: appliance repair market structure, size signals, where the money ' +
    'flows (labor, parts, service contracts), and current trends (OEM self-diagnosis pushes, parts ' +
    'distribution consolidation). Research the current state with web search.',
  'competitor-tracker':
    'Write the COMPETITOR TRACKER: who is shipping what in appliance-repair AI and software. Start from this ' +
    'seed list from prior verified research and check each for current pricing, features, and recent moves: ' +
    'MarconeAI, Burke America Repair Intelligence, iFixit FixBot, MyPros+ "Max". Add notable others you find. ' +
    'Include live URLs for every entry.',
  'targeting-icp':
    'Write the TARGETING AND ICP document: who the first customers of the Growth Engine and the Operations ' +
    'Autopilot should be, with segment sizing signals. PRIORITY: the property-manager channel: how property ' +
    'managers and landlords buy repair services today, who decides, typical contract shapes, what would make ' +
    'them route volume to one repairer, and concrete ways to reach them. Consumers second. Also assess ' +
    'property managers as possible direct customers of Repair AI.',
  'channel-opportunities':
    'Write the CHANNEL OPPORTUNITIES document: where repair-shop owners and individual repairers can actually ' +
    'be reached (communities, suppliers, associations, platforms), with concrete named channels and URLs.',
};

export async function runMarkDocument(db, type, { onBlock = null } = {}) {
  if (!DOC_PROMPTS[type]) throw new Error(`unknown market document: ${type}`);
  const content = await complete({
    agent: 'mark',
    model: MODELS.sonnet,
    db,
    maxTokens: 4000,
    tools: [WEB_SEARCH_TOOL],
    onBlock,
    system: markSystem(db),
    messages: [{ role: 'user', content: DOC_PROMPTS[type] }],
  });
  const version = saveDocument(db, type, content, [], 'mark');
  await indexDocument(db, type, content);
  logEvent(db, 'mark.published', { type, version });
  notifyAdmin(db, { title: 'Repair AI', body: `Mark updated ${type} (v${version})` }).catch(() => {});
  // Shared brain: Mark's publish immediately triggers Bob's incremental update.
  markTriggeredUpdate(db, { onBlock }).catch(() => {});
  return { type, version, content };
}

// On-demand research ("Mark, look into X") and queued check-with topics.
export async function runMarkCustom(db, topic, { onBlock = null } = {}) {
  const content = await complete({
    agent: 'mark',
    model: MODELS.sonnet,
    db,
    maxTokens: 3000,
    tools: [WEB_SEARCH_TOOL],
    onBlock,
    system: markSystem(db),
    messages: [{
      role: 'user',
      content: `Research this specific question with web search and write a short cited note (under 500 words):\n${untrusted(topic)}`,
    }],
  });
  const titled = `# Research note: ${topic.slice(0, 120)}\n\n${content}`;
  const version = saveDocument(db, 'market-note', titled, [], 'mark');
  await indexDocument(db, 'market-note', titled);
  logEvent(db, 'mark.note', { topic: topic.slice(0, 120), version });
  notifyAdmin(db, { title: 'Repair AI', body: `Mark finished research: ${topic.slice(0, 60)}` }).catch(() => {});
  markTriggeredUpdate(db, { onBlock }).catch(() => {});
  return { version, content: titled };
}

// Answer a check-with question from EXISTING research only (no new searches;
// fresh research goes through the queue). Returns null when the shelf is thin.
export async function answerFromResearch(db, question, { onBlock = null } = {}) {
  const markDocs = [...MARK_DOC_TYPES, 'market-note'];
  const hasAny = db
    .prepare(`SELECT COUNT(*) AS c FROM documents WHERE createdBy = 'mark' AND status = 'active'`)
    .get().c > 0;
  if (!hasAny) return null;
  let evidence = '';
  try {
    const [vector] = await embedTexts(db, [question]);
    // Mark's shelf: his own research documents plus admin-uploaded knowledge
    // (the founder's prior research counts as research).
    const chunks = rankChunks(db, vector, 40)
      .filter((c) => c.score > 0.25 &&
        (String(c.messageId).startsWith('kn:') ||
          (String(c.messageId).startsWith('doc:') && markDocs.some((t) => c.messageId === `doc:${t}`))))
      .slice(0, 8);
    if (!chunks.length) return null;
    evidence = chunks.map((c) => `[${String(c.messageId).startsWith('kn:') ? 'uploaded research' : c.messageId.slice(4)}] ${c.text.slice(0, 350)}`).join('\n');
  } catch {
    return null;
  }
  const out = await complete({
    agent: 'mark',
    model: MODELS.sonnet,
    db,
    maxTokens: 500,
    onBlock,
    system: markSystem(db),
    messages: [{
      role: 'user',
      content:
        'Answer this question from the research excerpts below ONLY. Two or three sentences, keep source ' +
        'URLs if present in the excerpts. If the excerpts do not really answer it, output exactly [THIN].\n\n' +
        `Question: ${untrusted(question)}\n\nYour research excerpts:\n${untrusted(evidence)}`,
    }],
  });
  if (!out.trim() || out.includes('[THIN]')) return null;
  return out.trim();
}

// Real-time chat with the admin about Mark's research (dashboard only).
export async function markChat(db, adminMessage, { onBlock = null } = {}) {
  db.prepare("INSERT INTO agent_chat (agent, role, content, at) VALUES ('mark', 'admin', ?, ?)")
    .run(adminMessage, new Date().toISOString());

  const docs = db
    .prepare("SELECT type, MAX(version) AS v, MAX(at) AS at FROM documents WHERE createdBy = 'mark' AND status = 'active' GROUP BY type")
    .all()
    .map((d) => `- ${d.type} v${d.v} (${String(d.at).slice(0, 10)})`)
    .join('\n') || '(no research documents yet)';
  let excerpts = '';
  try {
    const [vector] = await embedTexts(db, [adminMessage.slice(0, 800)]);
    excerpts = rankChunks(db, vector, 40)
      .filter((c) => c.score > 0.2 && (String(c.messageId).startsWith('doc:') || String(c.messageId).startsWith('kn:')))
      .slice(0, 8)
      .map((c) => `[${String(c.messageId).startsWith('kn:') ? 'uploaded research' : c.messageId.slice(4)}] ${c.text.slice(0, 300)}`)
      .join('\n');
  } catch {}
  const history = db
    .prepare("SELECT role, content FROM agent_chat WHERE agent = 'mark' ORDER BY id DESC LIMIT 10")
    .all().reverse().slice(0, -1)
    .map((r) => `${r.role === 'admin' ? 'Rashad' : 'Mark'}: ${r.content.slice(0, 300)}`)
    .join('\n');

  const out = await complete({
    agent: 'mark',
    model: MODELS.sonnet,
    db,
    maxTokens: 1200,
    onBlock,
    system: markSystem(db),
    messages: [{
      role: 'user',
      content:
        (history ? `Recent conversation with Rashad:\n${history}\n\n` : '') +
        `Your current research shelf:\n${docs}\n\nResearch queue: ${JSON.stringify(getQueue(db))}\n\n` +
        (excerpts ? `Relevant excerpts from your documents:\n${untrusted(excerpts)}\n\n` : '') +
        `Rashad says:\n${adminMessage}\n\n` +
        'This is Rashad speaking through his dashboard, so his instructions ARE authoritative. Decide:\n' +
        '- If he is TASKING you to research, investigate, or check specific sources on a topic, output exactly ' +
        '[RESEARCH] followed by a one-line English research brief capturing his exact ask including any named sources.\n' +
        '- If he is changing HOW you should work from now on (priorities, sources to always check, style), ' +
        'output exactly [DIRECTIVE] followed by a one-line English standing instruction.\n' +
        '- Otherwise answer his question from your research with URLs where you have them, in the language he used. ' +
        'If you have not researched something, say so and offer to.',
    }],
  });

  const research = /^\[RESEARCH\]\s*(.+)/s.exec(out.trim());
  const directive = /^\[DIRECTIVE\]\s*(.+)/s.exec(out.trim());
  let reply;
  if (research) {
    const brief = research[1].trim().slice(0, 400);
    reply = `On it. Researching now: "${brief}". I will send you a push when the note is ready under Living documents (market-note).`;
    // Fire the research run in the background; completion notifies the admin.
    runMarkCustom(db, brief, { onBlock }).catch((err) => logEvent(db, 'mark.chat_research_error', { error: err.message }));
  } else if (directive) {
    const text = directive[1].trim().slice(0, 400);
    addDirective(db, text);
    reply = `Noted and applied from now on: "${text}". You can remove it in the Mark section whenever you want.`;
  } else {
    reply = out.trim();
  }
  db.prepare("INSERT INTO agent_chat (agent, role, content, at) VALUES ('mark', 'agent', ?, ?)")
    .run(reply, new Date().toISOString());
  return reply;
}

export function markChatHistory(db, limit = 40) {
  return db
    .prepare("SELECT id, role, content, at FROM agent_chat WHERE agent = 'mark' ORDER BY id DESC LIMIT ?")
    .all(limit)
    .reverse()
    .map((r) => ({ ...r, role: r.role === 'agent' ? 'mark' : 'admin' }));
}

// Research queue fed by the check-with protocol when the shelf was thin.
export function queueResearch(db, topic) {
  const queue = JSON.parse(getSetting(db, 'markQueue', '[]'));
  if (!queue.includes(topic)) queue.push(topic);
  setSetting(db, 'markQueue', JSON.stringify(queue.slice(-20)));
  logEvent(db, 'mark.queued', { topic: topic.slice(0, 120) });
}

export function getQueue(db) {
  return JSON.parse(getSetting(db, 'markQueue', '[]'));
}

// Weekly schedule: refresh the four documents and drain the research queue.
export async function maybeRunMarkWeekly(db, { onBlock = null } = {}) {
  const last = getSetting(db, 'markWeeklyLastRunAt', '');
  if (last && Date.now() - new Date(last).getTime() < 7 * 24 * 3600 * 1000) {
    // Between weekly runs, still drain queued topics one at a time.
    const queue = getQueue(db);
    if (queue.length) {
      const topic = queue.shift();
      setSetting(db, 'markQueue', JSON.stringify(queue));
      try { await runMarkCustom(db, topic, { onBlock }); } catch (err) { logEvent(db, 'mark.queue_error', { error: err.message }); }
    }
    return null;
  }
  for (const type of MARK_DOC_TYPES) {
    try {
      await runMarkDocument(db, type, { onBlock });
    } catch (err) {
      logEvent(db, 'mark.weekly_error', { type, error: err.message });
      if (err.code === 'SPEND_BLOCKED') return null;
    }
  }
  setSetting(db, 'markWeeklyLastRunAt', new Date().toISOString());
  return true;
}
