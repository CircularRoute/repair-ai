// Admin dashboard, Phase 1: spend meter + ceiling + unblock, members and invite
// links, corpus browser with transcript corrections.

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
  return res.json();
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
});

// --- Spend ---
async function loadSpend() {
  const s = await api('/api/admin/spend');
  document.getElementById('spend-today').textContent = `$${s.today.toFixed(2)}`;
  document.getElementById('spend-mini').textContent =
    `$${s.today.toFixed(2)} today` + (s.blocked ? ' · BLOCKED' : '');
  // A tripped ceiling must be visible: force the section open.
  if (s.blocked) document.getElementById('spend-details').open = true;
  const ceiling = document.getElementById('ceiling-input');
  if (document.activeElement !== ceiling) ceiling.value = s.ceiling;
  document.getElementById('spend-blocked').hidden = !s.blocked;
  const agents = document.getElementById('spend-agents');
  agents.textContent = s.byAgentToday.length
    ? s.byAgentToday.map((r) => `${r.agent}/${r.model}: $${r.usd.toFixed(3)}`).join('  ·  ')
    : 'No API spend recorded today.';
}
document.getElementById('ceiling-save').addEventListener('click', async () => {
  const usd = Number(document.getElementById('ceiling-input').value);
  await api('/api/admin/spend/ceiling', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usd }),
  });
  loadSpend();
});
document.getElementById('unblock-btn').addEventListener('click', async () => {
  await api('/api/admin/spend/unblock', { method: 'POST' });
  loadSpend();
});

// --- Members ---
async function loadMembers() {
  const data = await api('/api/admin/members');
  const list = document.getElementById('member-list');
  list.innerHTML = '';
  const active = data.members.filter((m) => m.status !== 'retired');
  const retired = data.members.filter((m) => m.status === 'retired');
  document.getElementById('members-mini').textContent =
    `${active.length} active, ${active.filter((m) => m.consentShownAt).length} joined`;
  for (const m of active) {
    const li = el('li', 'member-row');
    const info = el('span');
    info.appendChild(el('strong', null, m.name));
    info.appendChild(el('span', 'muted small', `  ${m.role} · ${m.languages || m.language}${m.email ? ' · ' + m.email : ''}${m.consentShownAt ? ' · joined' : ' · not joined yet'}`));
    li.appendChild(info);
    const langBtn = el('button', 'ghost', 'Langs');
    langBtn.addEventListener('click', async () => {
      const current = m.languages || m.language;
      const input = window.prompt(
        `Languages for ${m.name}, comma separated, main first (en, ru, az):`, current);
      if (!input) return;
      const resp = await api('/api/admin/members/languages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: m.id, languages: input }),
      });
      if (resp.error) alert(resp.error);
      loadMembers();
    });
    li.appendChild(langBtn);
    if (m.role !== 'admin') {
      const btn = el('button', 'ghost danger', 'Remove');
      btn.addEventListener('click', async () => {
        if (!confirm(`Remove ${m.name}? They lose access immediately; their messages stay in the corpus.`)) return;
        await api('/api/admin/members/remove', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId: m.id }),
        });
        loadMembers();
      });
      li.appendChild(btn);
    }
    list.appendChild(li);
  }
  if (retired.length) {
    list.appendChild(el('li', 'muted small', `Removed: ${retired.map((m) => m.name).join(', ')}`));
  }
}
document.getElementById('invite-create').addEventListener('click', async () => {
  const name = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();
  const language = document.getElementById('invite-lang').value;
  const languages = [...document.querySelectorAll('.invite-extra:checked')].map((c) => c.value);
  if (!name) return;
  const data = await api('/api/admin/invites', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, language, languages }),
  });
  if (data.error) { alert(data.error); return; }
  const out = document.getElementById('invite-result');
  out.hidden = false;
  out.innerHTML = '';
  if (data.emailSent) {
    // Email members get the invitation email; no link handling needed.
    out.appendChild(el('div', null, `Invitation email sent to ${data.email}. ${name} signs in there with a 6-digit code.`));
  } else {
    if (data.email) {
      out.appendChild(el('div', 'error', 'The invitation email could not be sent; share the link below instead.'));
    }
    out.appendChild(el('div', 'muted', `Invite link for ${name} (valid 7 days, single use):`));
    out.appendChild(el('div', 'invite-url', data.url));
    const actions = el('div', 'row');
    const copyBtn = el('button', null, 'Copy link');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(data.url);
      } catch {
        // Clipboard API can be unavailable; fall back to a selectable prompt.
        window.prompt('Copy the link:', data.url);
      }
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 2000);
    });
    actions.appendChild(copyBtn);
    if (navigator.share) {
      const shareBtn = el('button', 'ghost', 'Share');
      shareBtn.addEventListener('click', () => {
        navigator.share({ title: 'Repair AI invite', url: data.url }).catch(() => {});
      });
      actions.appendChild(shareBtn);
    }
    out.appendChild(actions);
  }
  document.getElementById('invite-name').value = '';
  document.getElementById('invite-email').value = '';
  loadMembers();
});

// --- Corpus browser ---
async function loadCorpus() {
  // Collapsed by default; load only when the admin expands it.
  if (!document.getElementById('corpus-details').open) return;
  const data = await api('/api/admin/messages');
  const box = document.getElementById('corpus');
  box.innerHTML = '';
  for (const m of data.messages) {
    const item = el('div', 'corpus-item');
    const head = el('div', 'small');
    head.appendChild(el('strong', null, m.senderName));
    head.appendChild(el('span', 'muted', `  ${new Date(m.ts).toLocaleString()} · ${m.kind}` +
      (m.language ? ` · ${m.language}` : '') +
      (m.tags?.length ? ` · ${m.tags.map((t) => t.tag).join(', ')}` : '') +
      (m.status === 'deleted' ? ' · DELETED by sender (hidden from chat and agents)' : '') +
      (m.pipelineStatus !== 'done' ? ` · pipeline: ${m.pipelineStatus}` : '')));
    item.appendChild(head);

    if (m.status === 'deleted') {
      item.appendChild(el('div', 'muted small', `Original: ${m.originalText || m.transcript || m.fileName || '(media)'}`));
    } else if (m.kind === 'voice') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = '/api/chat/media/' + m.id;
      item.appendChild(audio);
      if (m.transcript) item.appendChild(el('div', null, m.transcript));
      if (m.transcriptAlt) item.appendChild(el('div', 'muted small', `Alt transcript: ${m.transcriptAlt}`));
      // Every voice transcript is correctable; corrections feed the glossary.
      {
        const fix = el('div', 'row');
        const input = document.createElement('input');
        input.value = m.transcript || '';
        input.placeholder = 'Corrected transcript';
        const btn = el('button', 'ghost', m.transcriptConfidence !== null && m.transcriptConfidence < 0.6 ? 'Save correction (low confidence)' : 'Save correction');
        btn.addEventListener('click', async () => {
          await api('/api/admin/correct-transcript', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: m.id, transcript: input.value }),
          });
          loadCorpus();
        });
        fix.appendChild(input);
        fix.appendChild(btn);
        item.appendChild(fix);
      }
    } else if (m.kind === 'file') {
      const a = el('a', 'file-link', m.fileName || 'attachment');
      a.href = '/api/chat/media/' + m.id;
      item.appendChild(a);
    } else {
      item.appendChild(el('div', null, m.text || ''));
    }
    if (m.englishText && m.language && m.language !== 'en') {
      item.appendChild(el('div', 'muted small', `EN: ${m.englishText}`));
    }
    box.appendChild(item);
  }
}

// --- Semantic search ---
async function runSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const tag = document.getElementById('search-tag').value;
  const box = document.getElementById('search-results');
  box.hidden = false;
  box.innerHTML = '';
  box.appendChild(el('div', 'muted small', 'Searching...'));
  const data = await api(`/api/admin/search?q=${encodeURIComponent(q)}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`);
  box.innerHTML = '';
  document.getElementById('search-clear').hidden = false;
  if (data.insights?.length) {
    box.appendChild(el('h3', null, 'Matching insights'));
    for (const i of data.insights.filter((x) => x.score > 0.25)) {
      const item = el('div', 'corpus-item');
      item.appendChild(el('div', null, i.text));
      item.appendChild(el('div', 'muted small', `${i.tag} · weight ${i.weight} · score ${i.score} · sources: ${i.sourceMessageIds.length}`));
      box.appendChild(item);
    }
  }
  box.appendChild(el('h3', null, 'Matching messages'));
  if (!data.results.length) box.appendChild(el('div', 'muted small', 'No matches.'));
  for (const r of data.results) {
    const item = el('div', 'corpus-item');
    const head = el('div', 'small');
    head.appendChild(el('strong', null, r.message.senderName));
    head.appendChild(el('span', 'muted', `  ${new Date(r.message.ts).toLocaleString()} · score ${r.score}` +
      (r.message.tags?.length ? ` · ${r.message.tags.map((t) => t.tag).join(', ')}` : '')));
    item.appendChild(head);
    item.appendChild(el('div', null, r.message.text || r.chunkText || ''));
    if (r.message.englishText && r.message.language !== 'en') {
      item.appendChild(el('div', 'muted small', `EN: ${r.message.englishText.slice(0, 200)}`));
    }
    box.appendChild(item);
  }
}
document.getElementById('search-btn').addEventListener('click', runSearch);
document.getElementById('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
document.getElementById('search-clear').addEventListener('click', () => {
  document.getElementById('search-results').hidden = true;
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').hidden = true;
});

// --- Insights ---
async function loadInsights() {
  if (!document.getElementById('insights-details').open) return;
  const data = await api('/api/admin/insights');
  document.getElementById('insights-mini').textContent = `${data.insights.length} extracted`;
  const list = document.getElementById('insights-list');
  list.innerHTML = '';
  if (!data.insights.length) list.appendChild(el('div', 'muted small', 'No insights yet. Chat first, then extract.'));
  for (const i of data.insights) {
    const item = el('div', 'corpus-item');
    item.appendChild(el('div', null, i.text));
    item.appendChild(el('div', 'muted small', `${i.tag} · weight ${i.weight} · ${new Date(i.extractedAt).toLocaleString()}`));
    for (const s of i.sources) {
      item.appendChild(el('div', 'muted small', `  source ${s.sender || s.id}: "${s.text || ''}"`));
    }
    list.appendChild(item);
  }
}
document.getElementById('insights-details').addEventListener('toggle', loadInsights);
document.getElementById('insights-run').addEventListener('click', async () => {
  const status = document.getElementById('insights-status');
  status.textContent = 'Extracting...';
  const data = await api('/api/admin/insights/run', { method: 'POST' });
  status.textContent = data.error
    ? data.error
    : `Processed ${data.processed} messages, ${data.extracted} insights, ${data.proposals} tag proposals.`;
  loadInsights();
  loadTaxonomy();
});

// --- Taxonomy ---
async function loadTaxonomy() {
  const data = await api('/api/admin/taxonomy');
  const pending = data.proposals.filter((p) => p.status === 'pending');
  document.getElementById('taxonomy-mini').textContent =
    pending.length ? `${pending.length} pending approval` : `${data.tags.length} tags`;
  const box = document.getElementById('taxonomy-proposals');
  box.innerHTML = '';
  if (!data.proposals.length) box.appendChild(el('div', 'muted small', 'No proposals yet.'));
  for (const p of data.proposals) {
    const item = el('div', 'corpus-item');
    item.appendChild(el('strong', null, p.tag));
    if (p.evidence) item.appendChild(el('div', 'muted small', p.evidence));
    if (p.status === 'pending') {
      const row = el('div', 'row');
      const yes = el('button', null, 'Approve');
      const no = el('button', 'ghost', 'Reject');
      yes.addEventListener('click', async () => {
        await api('/api/admin/taxonomy/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, approve: true }) });
        loadTaxonomy();
      });
      no.addEventListener('click', async () => {
        await api('/api/admin/taxonomy/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, approve: false }) });
        loadTaxonomy();
      });
      row.appendChild(yes);
      row.appendChild(no);
      item.appendChild(row);
    } else {
      item.appendChild(el('div', 'muted small', p.status));
    }
    box.appendChild(item);
  }
  // Fill the search tag filter with current tags.
  const select = document.getElementById('search-tag');
  if (select.options.length <= 1) {
    for (const t of data.tags) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      select.appendChild(opt);
    }
  }
}

// --- Agent chats (Bob and Mark share the machinery) ---
function addChatMsg(boxId, role, text, pending = false) {
  const box = document.getElementById(boxId);
  const div = el('div', `bob-msg ${role === 'admin' ? 'admin' : 'bob'}${pending ? ' pending' : ''}`, text);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}
async function loadAgentChat(agent, boxId, emptyLine) {
  const data = await api(`/api/admin/${agent}-chat`);
  const box = document.getElementById(boxId);
  box.innerHTML = '';
  if (!data.messages.length) addChatMsg(boxId, 'bob', emptyLine);
  for (const m of data.messages) addChatMsg(boxId, m.role, m.content);
}
const loadBobChat = () => loadAgentChat('bob', 'bob-chat', 'Ask me anything about what the group has said so far, or teach me how you want me to work. I cite my sources.');

async function loadBobDirectives() {
  const data = await api('/api/admin/bob/directives');
  const box = document.getElementById('bob-directives');
  box.innerHTML = '';
  if (!data.directives.length) return;
  box.appendChild(el('div', null, 'Standing instructions:'));
  data.directives.forEach((d, i) => {
    const row = el('div', 'row');
    row.appendChild(el('span', 'small', d));
    const rm = el('button', 'ghost danger', 'Remove');
    rm.addEventListener('click', async () => {
      await api('/api/admin/bob/directives/remove', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: i }),
      });
      loadBobDirectives();
    });
    row.appendChild(rm);
    box.appendChild(row);
  });
}
const loadMarkChat = () => loadAgentChat('mark', 'mark-chat', 'Ask me about the market, competitors, or anything I have researched.');

async function sendToAgent(agent, inputId, boxId) {
  const input = document.getElementById(inputId);
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addChatMsg(boxId, 'admin', text);
  const pending = addChatMsg(boxId, 'bob', 'Thinking...', true);
  const data = await api(`/api/admin/${agent}-chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  pending.remove();
  addChatMsg(boxId, 'bob', data.reply || data.error || 'Something went wrong.');
  if (agent === 'bob') loadBobDirectives();
  if (agent === 'mark') loadMarkQueue();
}
const sendToBob = () => sendToAgent('bob', 'bob-input', 'bob-chat');
const sendToMark = () => sendToAgent('mark', 'mark-input', 'mark-chat');
document.getElementById('bob-send').addEventListener('click', sendToBob);
document.getElementById('bob-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendToBob(); });
document.getElementById('mark-send').addEventListener('click', sendToMark);
document.getElementById('mark-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendToMark(); });

// Voice questions: tap the mic to record, tap again to stop; the transcript
// lands in the input and sends itself.
function setupMic(btnId, inputId, sendFn) {
  const btn = document.getElementById(btnId);
  let recorder = null;
  btn.addEventListener('click', async () => {
    if (recorder) {
      recorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || 'audio/mp4';
        recorder = null;
        btn.classList.remove('recording');
        const blob = new Blob(chunks, { type });
        if (!blob.size) return;
        const input = document.getElementById(inputId);
        input.value = 'Transcribing...';
        const res = await fetch('/api/admin/transcribe', { method: 'POST', headers: { 'Content-Type': type }, body: blob });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.text) {
          input.value = data.text;
          sendFn();
        } else {
          input.value = '';
          alert(data.error || 'Could not transcribe.');
        }
      };
      recorder.start();
      btn.classList.add('recording');
    } catch {
      alert('Microphone access is needed to record a question.');
    }
  });
}
setupMic('bob-mic', 'bob-input', sendToBob);
setupMic('mark-mic', 'mark-input', sendToMark);

// --- Living documents ---
async function loadDocs() {
  const data = await api('/api/admin/documents');
  const withVersions = data.documents.filter((d) => d.version > 0).length;
  document.getElementById('docs-mini').textContent = `${withVersions} of ${data.documents.length} generated`;
  const list = document.getElementById('docs-list');
  list.innerHTML = '';
  for (const d of data.documents) {
    const item = el('div', 'corpus-item');
    const head = el('div', 'row');
    head.appendChild(el('strong', null, d.type));
    head.appendChild(el('span', 'muted small', d.version ? `v${d.version} · ${new Date(d.at).toLocaleString()}` : 'not generated yet'));
    if (d.version) {
      const viewBtn = el('button', 'ghost', 'View');
      viewBtn.addEventListener('click', async () => {
        const doc = await api(`/api/admin/documents/${encodeURIComponent(d.type)}`);
        const view = document.getElementById('doc-view');
        view.hidden = false;
        view.textContent = `${doc.type} v${doc.version} (${new Date(doc.at).toLocaleString()})\n\n${doc.content}`;
        view.scrollIntoView({ behavior: 'smooth' });
      });
      head.appendChild(viewBtn);
    }
    const runBtn = el('button', 'ghost', d.version ? 'Re-run' : 'Generate');
    runBtn.addEventListener('click', async () => {
      document.getElementById('docs-status').textContent = `Generating ${d.type}...`;
      const r = await api('/api/admin/documents/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: d.type }),
      });
      document.getElementById('docs-status').textContent = r.error || 'Done';
      loadDocs();
    });
    head.appendChild(runBtn);
    item.appendChild(head);
    list.appendChild(item);
  }
}
document.getElementById('docs-run-all').addEventListener('click', async () => {
  document.getElementById('docs-status').textContent = 'Running full synthesis, this takes a few minutes...';
  const r = await api('/api/admin/documents/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'all' }),
  });
  document.getElementById('docs-status').textContent = r.error || 'Full synthesis complete';
  loadDocs();
});
document.getElementById('docs-run-digest').addEventListener('click', async () => {
  document.getElementById('docs-status').textContent = 'Running digest...';
  const r = await api('/api/admin/documents/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'digest' }),
  });
  document.getElementById('docs-status').textContent = r.error || (r.ran ? 'Digest written' : 'Nothing new in the last 24h');
  loadDocs();
});
document.getElementById('docs-details').addEventListener('toggle', loadDocs);

// --- Mark ---
async function loadMarkQueue() {
  const data = await api('/api/admin/mark/queue');
  document.getElementById('mark-mini').textContent = data.queue.length ? `${data.queue.length} queued` : 'market analyst';
  const box = document.getElementById('mark-queue');
  box.innerHTML = '';
  if (data.queue.length) box.appendChild(el('div', null, 'Research queue: ' + data.queue.join(' · ')));
  if (data.directives?.length) {
    box.appendChild(el('div', null, 'Standing instructions:'));
    data.directives.forEach((d, i) => {
      const row = el('div', 'row');
      row.appendChild(el('span', 'small', d));
      const rm = el('button', 'ghost danger', 'Remove');
      rm.addEventListener('click', async () => {
        await api('/api/admin/mark/directives/remove', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: i }),
        });
        loadMarkQueue();
      });
      row.appendChild(rm);
      box.appendChild(row);
    });
  }
}
document.getElementById('mark-research').addEventListener('click', async () => {
  const topic = document.getElementById('mark-topic').value.trim();
  if (!topic) return;
  document.getElementById('mark-status').textContent = 'Mark is researching, give it a minute...';
  const r = await api('/api/admin/mark/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic }),
  });
  document.getElementById('mark-status').textContent = r.error || 'Done, see market-note under Living documents.';
  document.getElementById('mark-topic').value = '';
  loadDocs();
});
for (const btn of document.querySelectorAll('.mark-run')) {
  btn.addEventListener('click', async () => {
    document.getElementById('mark-status').textContent = `Researching ${btn.dataset.type}...`;
    const r = await api('/api/admin/mark/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: btn.dataset.type }),
    });
    document.getElementById('mark-status').textContent = r.error || `${btn.dataset.type} updated.`;
    loadDocs();
  });
}

// --- Agent requests (check-with queue) ---
async function loadRequests() {
  const data = await api('/api/admin/agent-requests');
  const open = data.requests.filter((r) => r.status === 'open').length;
  document.getElementById('requests-mini').textContent = data.requests.length
    ? `${data.requests.length} total${open ? `, ${open} open` : ''}` : 'none yet';
  const list = document.getElementById('requests-list');
  list.innerHTML = '';
  if (!data.requests.length) list.appendChild(el('div', 'muted small', 'No requests yet.'));
  for (const r of data.requests) {
    const item = el('div', 'corpus-item');
    item.appendChild(el('div', null, `${r.fromAgent} asked ${r.toAgent}: ${r.question}`));
    item.appendChild(el('div', 'muted small', `${r.status} · ${new Date(r.askedAt).toLocaleString()}`));
    if (r.answer) item.appendChild(el('div', 'muted small', `Answer: ${r.answer.slice(0, 300)}`));
    if (r.status === 'open' || r.status === 'declined') {
      const row = el('div', 'row');
      const input = document.createElement('input');
      input.placeholder = 'Answer by hand (Otto relays it)';
      const send = el('button', 'ghost', 'Answer');
      send.addEventListener('click', async () => {
        if (!input.value.trim()) return;
        await api('/api/admin/agent-requests/answer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: r.id, answer: input.value.trim() }),
        });
        loadRequests();
      });
      row.appendChild(input);
      row.appendChild(send);
      if (r.status === 'open') {
        const cancel = el('button', 'ghost danger', 'Cancel');
        cancel.addEventListener('click', async () => {
          await api('/api/admin/agent-requests/cancel', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }),
          });
          loadRequests();
        });
        row.appendChild(cancel);
      }
      item.appendChild(row);
    }
    list.appendChild(item);
  }
}
document.getElementById('requests-details').addEventListener('toggle', loadRequests);

// --- Tools registry ---
async function loadTools() {
  const data = await api('/api/admin/tools');
  document.getElementById('tools-mini').textContent = data.tools.length ? `${data.tools.length} registered` : 'none yet';
  const list = document.getElementById('tools-list');
  list.innerHTML = '';
  if (!data.tools.length) list.appendChild(el('div', 'muted small', 'No tools registered yet.'));
  for (const t of data.tools) {
    const item = el('div', 'corpus-item');
    const head = el('div', 'row');
    head.appendChild(el('strong', null, t.name));
    head.appendChild(el('span', 'muted small', `${t.baseUrl} · auth: ${t.authType}` +
      (t.authEnvVar ? ` (${t.authEnvVar}${t.hasKey ? ', key present' : ', KEY MISSING on server'})` : '')));
    const rm = el('button', 'ghost danger', 'Remove');
    rm.addEventListener('click', async () => {
      if (!confirm(`Remove tool ${t.name}?`)) return;
      await api('/api/admin/tools/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) });
      loadTools();
    });
    head.appendChild(rm);
    item.appendChild(head);
    item.appendChild(el('div', 'muted small', t.description));
    list.appendChild(item);
  }
}
document.getElementById('tool-add').addEventListener('click', async () => {
  const payload = {
    name: document.getElementById('tool-name').value,
    baseUrl: document.getElementById('tool-base').value.trim(),
    description: document.getElementById('tool-desc').value,
    authType: document.getElementById('tool-auth').value,
    authEnvVar: document.getElementById('tool-env').value.trim() || null,
    authParamName: document.getElementById('tool-param').value.trim() || null,
  };
  const r = await api('/api/admin/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  document.getElementById('tool-status').textContent = r.error || `Registered ${r.name}. Bob can call it in chat now.`;
  if (!r.error) for (const id of ['tool-name', 'tool-base', 'tool-desc', 'tool-env', 'tool-param']) document.getElementById(id).value = '';
  loadTools();
});
document.getElementById('tools-details').addEventListener('toggle', loadTools);

// --- Knowledge ---
async function loadKnowledge() {
  const data = await api('/api/admin/knowledge');
  document.getElementById('knowledge-mini').textContent = data.knowledge.length ? `${data.knowledge.length} items` : 'none yet';
  const list = document.getElementById('knowledge-list');
  list.innerHTML = '';
  if (!data.knowledge.length) list.appendChild(el('div', 'muted small', 'Nothing uploaded yet.'));
  for (const k of data.knowledge) {
    const item = el('div', 'corpus-item');
    const head = el('div', 'row');
    head.appendChild(el('strong', null, k.title));
    head.appendChild(el('span', 'muted small', `${k.kind} · ${new Date(k.addedAt).toLocaleDateString()}`));
    const rm = el('button', 'ghost danger', 'Remove');
    rm.addEventListener('click', async () => {
      if (!confirm(`Remove "${k.title}" from the corpus?`)) return;
      await api('/api/admin/knowledge/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: k.id }) });
      loadKnowledge();
    });
    head.appendChild(rm);
    item.appendChild(head);
    list.appendChild(item);
  }
}
document.getElementById('kn-file').addEventListener('change', async () => {
  const file = document.getElementById('kn-file').files[0];
  document.getElementById('kn-file').value = '';
  if (!file) return;
  document.getElementById('kn-status').textContent = `Uploading and indexing ${file.name}...`;
  const res = await fetch('/api/admin/knowledge/file', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  document.getElementById('kn-status').textContent = data.error || `Indexed ${file.name} (${data.chunks} chunks).`;
  loadKnowledge();
});
document.getElementById('kn-link-add').addEventListener('click', async () => {
  const url = document.getElementById('kn-link').value.trim();
  if (!url) return;
  document.getElementById('kn-status').textContent = 'Fetching and indexing link...';
  const r = await api('/api/admin/knowledge/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  document.getElementById('kn-status').textContent = r.error || `Indexed "${r.title}" (${r.chunks} chunks).`;
  document.getElementById('kn-link').value = '';
  loadKnowledge();
});
document.getElementById('kn-note-add').addEventListener('click', async () => {
  const title = document.getElementById('kn-note-title').value.trim();
  if (!title) { alert('Give the note a title first.'); return; }
  const text = window.prompt(`Note text for "${title}":`);
  if (!text) return;
  const r = await api('/api/admin/knowledge/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, text }) });
  document.getElementById('kn-status').textContent = r.error || `Indexed note (${r.chunks} chunks).`;
  document.getElementById('kn-note-title').value = '';
  loadKnowledge();
});
document.getElementById('knowledge-details').addEventListener('toggle', loadKnowledge);

// --- Agent controls ---
async function loadAgentSettings() {
  const s = await api('/api/admin/agent-settings');
  document.getElementById('otto-muted').checked = s.ottoMuted;
  document.getElementById('otto-cap').value = s.ottoCap;
  document.getElementById('otto-proactive').value = s.ottoProactivePerDay;
  const langs = s.ottoVoiceLangs.split(',');
  for (const cb of document.querySelectorAll('.otto-voice')) cb.checked = langs.includes(cb.value);
  document.getElementById('bob-fable').checked = s.bobFable;
  document.getElementById('agent-mini').textContent = s.ottoMuted ? 'Otto MUTED' : `cap ${s.ottoCap}, ${s.ottoProactivePerDay}/day`;
}
document.getElementById('agent-save').addEventListener('click', async () => {
  await api('/api/admin/agent-settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ottoMuted: document.getElementById('otto-muted').checked,
      ottoCap: Number(document.getElementById('otto-cap').value),
      ottoProactivePerDay: Number(document.getElementById('otto-proactive').value),
      ottoVoiceLangs: [...document.querySelectorAll('.otto-voice:checked')].map((c) => c.value).join(','),
      bobFable: document.getElementById('bob-fable').checked,
    }),
  });
  document.getElementById('agent-status').textContent = 'Saved';
  setTimeout(() => { document.getElementById('agent-status').textContent = ''; }, 2000);
  loadAgentSettings();
});

async function init() {
  const res = await fetch('/api/me');
  if (!res.ok) { location.href = '/login'; return; }
  const meData = await res.json();
  document.getElementById('whoami').textContent = meData.name;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin/sw.js');
  document.getElementById('corpus-details').addEventListener('toggle', loadCorpus);
  await Promise.all([loadSpend(), loadMembers(), loadTaxonomy(), loadAgentSettings(), loadBobChat(), loadBobDirectives(), loadMarkChat(), loadDocs(), loadMarkQueue(), loadRequests()]);
  setInterval(loadSpend, 30000);
  setInterval(loadCorpus, 30000);
}
init();
