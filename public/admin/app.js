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
  for (const m of data.members) {
    const li = el('li', null);
    li.appendChild(el('strong', null, m.name));
    li.appendChild(el('span', 'muted small', `  ${m.role} · ${m.languages || m.language}${m.consentShownAt ? ' · joined' : ' · invited, not joined yet'}`));
    list.appendChild(li);
  }
}
document.getElementById('invite-create').addEventListener('click', async () => {
  const name = document.getElementById('invite-name').value.trim();
  const language = document.getElementById('invite-lang').value;
  const languages = [...document.querySelectorAll('.invite-extra:checked')].map((c) => c.value);
  if (!name) return;
  const data = await api('/api/admin/invites', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, language, languages }),
  });
  const out = document.getElementById('invite-result');
  out.hidden = false;
  out.innerHTML = '';
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
  document.getElementById('invite-name').value = '';
  loadMembers();
});

// --- Corpus browser ---
async function loadCorpus() {
  const data = await api('/api/admin/messages');
  const box = document.getElementById('corpus');
  box.innerHTML = '';
  for (const m of data.messages) {
    const item = el('div', 'corpus-item');
    const head = el('div', 'small');
    head.appendChild(el('strong', null, m.senderName));
    head.appendChild(el('span', 'muted', `  ${new Date(m.ts).toLocaleString()} · ${m.kind}` +
      (m.language ? ` · ${m.language}` : '') +
      (m.pipelineStatus !== 'done' ? ` · pipeline: ${m.pipelineStatus}` : '')));
    item.appendChild(head);

    if (m.kind === 'voice') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = '/api/chat/media/' + m.id;
      item.appendChild(audio);
      if (m.transcript) item.appendChild(el('div', null, m.transcript));
      if (m.transcriptAlt) item.appendChild(el('div', 'muted small', `Alt transcript: ${m.transcriptAlt}`));
      if (m.transcriptConfidence !== null && m.transcriptConfidence < 0.6) {
        const fix = el('div', 'row');
        const input = document.createElement('input');
        input.value = m.transcript || '';
        input.placeholder = 'Corrected transcript';
        const btn = el('button', 'ghost', 'Save correction');
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

async function init() {
  const res = await fetch('/api/me');
  if (!res.ok) { location.href = '/login'; return; }
  const meData = await res.json();
  document.getElementById('whoami').textContent = meData.name;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin/sw.js');
  await Promise.all([loadSpend(), loadMembers(), loadCorpus()]);
  setInterval(loadSpend, 30000);
  setInterval(loadCorpus, 30000);
}
init();
