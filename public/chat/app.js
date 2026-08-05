// Repair AI member chat. Text, voice notes (MediaRecorder, stored as the browser
// produces them), allowlisted attachments, live updates via SSE with polling
// fallback, and web push.

let me = null;
let lastTs = null;
const messagesEl = document.getElementById('messages');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const fileInput = document.getElementById('file-input');

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

function renderMessage(m) {
  const existing = document.getElementById('msg-' + m.id);
  if (existing) {
    // Only a deletion changes an already-rendered message.
    if (m.deleted && !existing.classList.contains('deleted')) {
      existing.replaceWith(buildMessage(m));
    }
    return;
  }
  messagesEl.appendChild(buildMessage(m));
  messagesEl.scrollTop = messagesEl.scrollHeight;
  if (m.ts > (lastTs || '')) lastTs = m.ts;
}

function buildMessage(m) {
  const div = document.createElement('div');
  div.id = 'msg-' + m.id;
  div.className = 'msg';
  if (m.senderKind === 'system') div.classList.add('system');
  else if (m.senderKind === 'agent') div.classList.add('agent');
  else if (me && m.senderId === me.memberId) div.classList.add('mine');
  if (m.deleted) div.classList.add('deleted');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (m.deleted) {
    const ph = document.createElement('span');
    ph.className = 'deleted-note';
    ph.textContent = '\u{1F6AB} This message was deleted';
    bubble.appendChild(ph);
  } else if (m.kind === 'voice') {
    // Voice bubbles show only the player; transcripts live in the admin
    // corpus browser, not in the group chat.
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = '/api/chat/media/' + m.id;
    bubble.appendChild(audio);
  } else if (m.kind === 'file') {
    const a = document.createElement('a');
    a.className = 'file-link';
    a.href = '/api/chat/media/' + m.id;
    a.textContent = m.fileName || 'attachment';
    bubble.appendChild(a);
    const size = document.createElement('div');
    size.className = 'file-size';
    size.textContent = fmtSize(m.fileSize);
    bubble.appendChild(size);
  } else {
    bubble.textContent = m.text || '';
  }

  div.appendChild(bubble);
  if (m.senderKind !== 'system') {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${m.senderName} · ${fmtTime(m.ts)}`;
    div.appendChild(meta);
  }

  // WhatsApp-style delete: long-press your own message (the admin can delete
  // any member or Otto message).
  const canDelete = !m.deleted && me &&
    ((m.senderKind === 'member' && m.senderId === me.memberId) ||
      (me.role === 'admin' && m.senderKind !== 'system'));
  if (canDelete) attachLongPress(bubble, () => confirmDelete(m));
  return div;
}

function attachLongPress(el2, handler) {
  let timer = null;
  const start = () => { timer = setTimeout(handler, 550); };
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  el2.addEventListener('touchstart', start, { passive: true });
  el2.addEventListener('touchend', cancel);
  el2.addEventListener('touchmove', cancel);
  el2.addEventListener('touchcancel', cancel);
  el2.addEventListener('contextmenu', (e) => { e.preventDefault(); handler(); });
}

async function confirmDelete(m) {
  if (!confirm('Delete this message for everyone?')) return;
  const res = await fetch('/api/chat/message/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: m.id }),
  });
  if (res.ok) renderMessage({ ...m, deleted: true, text: null, hasAudio: false, fileName: null });
}

async function loadMessages() {
  const res = await fetch('/api/chat/messages' + (lastTs ? `?after=${encodeURIComponent(lastTs)}` : ''));
  if (res.status === 401) { location.href = '/login'; return; }
  const data = await res.json();
  data.messages.forEach(renderMessage);
}

function connectStream() {
  const es = new EventSource('/api/chat/stream');
  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (event.type === 'message') renderMessage(event.message);
    } catch {}
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectStream, 5000);
  };
}

// --- Sending text ---
function updateComposer() {
  const hasText = textInput.value.trim().length > 0;
  sendBtn.hidden = !hasText;
  micBtn.hidden = hasText;
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
}
textInput.addEventListener('input', updateComposer);
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
    e.preventDefault();
    sendText();
  }
});
sendBtn.addEventListener('click', sendText);

async function sendText() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = '';
  updateComposer();
  const res = await fetch('/api/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (res.ok) {
    const data = await res.json();
    renderMessage(data.message);
  }
}

// --- Voice notes ---
let recorder = null;
let recChunks = [];
let recTimer = null;
let recSeconds = 0;
let recWanted = false;
const recBar = document.getElementById('rec-bar');
const recTime = document.getElementById('rec-time');

micBtn.addEventListener('click', async () => {
  if (recorder) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Prefer AAC/mp4 where supported (iOS native, plays everywhere Apple);
    // Chrome and Firefox fall back to webm/opus, which they play natively.
    const mime = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recChunks = [];
    recWanted = false;
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = recorder.mimeType || 'audio/webm';
      const blob = new Blob(recChunks, { type });
      recorder = null;
      recBar.hidden = true;
      clearInterval(recTimer);
      if (!recWanted || blob.size === 0) return;
      const res = await fetch('/api/chat/voice', { method: 'POST', headers: { 'Content-Type': type }, body: blob });
      if (res.ok) {
        const data = await res.json();
        renderMessage(data.message);
      } else {
        alert('Could not send the voice note.');
      }
    };
    recorder.start();
    recSeconds = 0;
    recTime.textContent = '0:00';
    recBar.hidden = false;
    recTimer = setInterval(() => {
      recSeconds++;
      recTime.textContent = `${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, '0')}`;
      if (recSeconds >= 600) stopRecording(true);
    }, 1000);
  } catch {
    alert('Microphone access is needed for voice notes.');
  }
});

function stopRecording(send) {
  if (!recorder) return;
  recWanted = send;
  recorder.stop();
}
document.getElementById('rec-send').addEventListener('click', () => stopRecording(true));
document.getElementById('rec-cancel').addEventListener('click', () => stopRecording(false));

// --- Attachments ---
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { alert('Files up to 25 MB.'); return; }
  const res = await fetch('/api/chat/file', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  if (res.ok) {
    const data = await res.json();
    renderMessage(data.message);
  } else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'This file type is not allowed.');
  }
});

// --- Push notifications ---
// Notifications are a key feature (founder ruling): the banner stays visible
// on every open until push is actually enabled on this device.
async function setupPush() {
  const banner = document.getElementById('push-banner');
  const bannerText = document.getElementById('push-banner-text');
  const enableBtn = document.getElementById('push-enable');
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.register('/chat/sw.js');
  const { key } = await (await fetch('/api/push/key')).json();
  if (!key) return;

  const supported = 'PushManager' in window && 'Notification' in window;

  async function syncSubscription(sub) {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
  }

  async function refreshBanner() {
    if (!supported) {
      if (isIOS && !standalone) {
        bannerText.textContent =
          'Notifications need the installed app: tap Share, then Add to Home Screen, and open Repair AI from your home screen.';
        enableBtn.hidden = true;
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      await syncSubscription(sub);
      banner.hidden = true;
      return;
    }
    if (Notification.permission === 'denied') {
      bannerText.textContent =
        'Notifications are blocked for Repair AI. Enable them in your phone Settings under Notifications, then reopen the app.';
      enableBtn.hidden = true;
      banner.hidden = false;
      return;
    }
    bannerText.textContent =
      'Turn on notifications so you never miss a message. It is a key part of this group.';
    enableBtn.hidden = false;
    banner.hidden = false;
  }

  enableBtn.addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        await syncSubscription(sub);
      }
    } catch {}
    refreshBanner();
  });

  await refreshBanner();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// --- iOS keyboard and viewport handling ---
// Keep the app exactly the size of the visual viewport: the composer stays
// glued to the keyboard while typing and returns to the true bottom when the
// keyboard closes or the phone rotates. iOS also leaves the page scrolled
// after the keyboard opens; snapping scroll back fixes the floating gap.
function syncViewport() {
  const vv = window.visualViewport;
  if (vv) {
    document.body.style.height = vv.height + 'px';
    window.scrollTo(0, 0);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewport);
  window.visualViewport.addEventListener('scroll', () => window.scrollTo(0, 0));
}
window.addEventListener('orientationchange', () => setTimeout(syncViewport, 300));

// iOS does not dismiss the keyboard on taps outside the input; do it on any
// touch in the message list or the header.
for (const el of [messagesEl, document.querySelector('.chat-top')]) {
  el.addEventListener('touchstart', () => {
    if (document.activeElement === textInput) textInput.blur();
  }, { passive: true });
}
textInput.addEventListener('blur', () => setTimeout(syncViewport, 100));

// --- Boot ---
async function init() {
  const res = await fetch('/api/me');
  if (!res.ok) { location.href = '/login'; return; }
  me = await res.json();
  if (me.role === 'admin') document.getElementById('admin-link').hidden = false;
  await loadMessages();
  connectStream();
  setInterval(loadMessages, 15000);
  setupPush();
  updateComposer();
}
init();
