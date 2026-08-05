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

// --- Bob chat ---
function addBobMsg(role, text, pending = false) {
  const box = document.getElementById('bob-chat');
  const div = el('div', `bob-msg ${role}${pending ? ' pending' : ''}`, text);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}
async function loadBobChat() {
  const data = await api('/api/admin/bob-chat');
  const box = document.getElementById('bob-chat');
  box.innerHTML = '';
  if (!data.messages.length) addBobMsg('bob', 'Ask me anything about what the group has said so far. I cite my sources.');
  for (const m of data.messages) addBobMsg(m.role, m.content);
}
async function sendToBob() {
  const input = document.getElementById('bob-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addBobMsg('admin', text);
  const pending = addBobMsg('bob', 'Thinking...', true);
  const data = await api('/api/admin/bob-chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  pending.remove();
  addBobMsg('bob', data.reply || data.error || 'Something went wrong.');
}
document.getElementById('bob-send').addEventListener('click', sendToBob);
document.getElementById('bob-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendToBob(); });

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
  await Promise.all([loadSpend(), loadMembers(), loadTaxonomy(), loadAgentSettings(), loadBobChat(), loadDocs()]);
  setInterval(loadSpend, 30000);
  setInterval(loadCorpus, 30000);
}
init();
