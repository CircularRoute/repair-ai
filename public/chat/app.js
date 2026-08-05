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
const notifyBtn = document.getElementById('notify-btn');

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

function renderMessage(m) {
  if (document.getElementById('msg-' + m.id)) return;
  const div = document.createElement('div');
  div.id = 'msg-' + m.id;
  div.className = 'msg';
  if (m.senderKind === 'system') div.classList.add('system');
  else if (m.senderKind === 'agent') div.classList.add('agent');
  else if (me && m.senderId === me.memberId) div.classList.add('mine');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (m.kind === 'voice') {
    if (m.text) bubble.textContent = m.text;
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
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  if (m.ts > (lastTs || '')) lastTs = m.ts;
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
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
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
async function setupPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.register('/chat/sw.js');
  const keyRes = await fetch('/api/push/key');
  const { key } = await keyRes.json();
  if (!key) return;

  async function subscribe() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    notifyBtn.hidden = true;
  }

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: existing.toJSON() }),
    });
  } else if (Notification.permission === 'granted') {
    subscribe();
  } else {
    notifyBtn.hidden = false;
    notifyBtn.addEventListener('click', subscribe);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

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
