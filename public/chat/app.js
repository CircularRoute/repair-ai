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

// WhatsApp-style date separators: Today, Yesterday, then full dates.
let lastDayKey = null;
function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function ensureDayDivider(ts) {
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (key === lastDayKey) return;
  lastDayKey = key;
  const div = document.createElement('div');
  div.className = 'day-divider';
  div.textContent = dayLabel(ts);
  messagesEl.appendChild(div);
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
  ensureDayDivider(m.ts);
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
    // Member voice bubbles show only the player (transcripts live in the
    // corpus browser). Otto's voice notes always carry their text too.
    if (m.senderKind === 'agent' && m.text) {
      const textDiv = document.createElement('div');
      textDiv.textContent = m.text;
      bubble.appendChild(textDiv);
    }
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
  const canDelete = !m.deleted && me &&
    ((m.senderKind === 'member' && m.senderId === me.memberId) ||
      (me.role === 'admin' && m.senderKind !== 'system'));

  if (m.senderKind !== 'system') {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${m.senderName} · ${fmtTime(m.ts)}`;
    if (canDelete) {
      // Discoverable delete: tap the bubble to reveal, then confirm.
      const chip = document.createElement('button');
      chip.className = 'delete-chip';
      chip.textContent = 'Delete';
      chip.hidden = true;
      chip.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(m); });
      meta.appendChild(chip);
      bubble.addEventListener('click', (e) => {
        if (e.target.closest('audio, a')) return;
        chip.hidden = !chip.hidden;
      });
    }
    div.appendChild(meta);
  }

  // Long-press (or right-click on desktop) also works, WhatsApp-style.
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

// Prefer the phone's BUILT-IN microphone over Bluetooth/car routes, like
// native messengers do. iOS hands web apps whatever mic the system routed
// to (often the car), and that route is what dies mid-recording; asking for
// the built-in mic by deviceId avoids it where Safari allows.
async function getRecordingStream() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    const label = stream.getAudioTracks()[0]?.label || '';
    if (/iphone|ipad|built-in|internal/i.test(label)) return stream;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const builtIn = devices.find(
      (d) => d.kind === 'audioinput' && /iphone|ipad|built-in|internal/i.test(d.label));
    if (!builtIn) return stream;
    const better = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: builtIn.deviceId } },
    });
    stream.getTracks().forEach((t) => t.stop());
    return better;
  } catch {
    return stream;
  }
}

micBtn.addEventListener('click', async () => {
  if (recorder) return;
  try {
    const stream = await getRecordingStream();
    // Prefer AAC/mp4 where supported (iOS native, plays everywhere Apple);
    // Chrome and Firefox fall back to webm/opus, which they play natively.
    const mime = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recChunks = [];
    recWanted = false;
    // iOS silently stops delivering audio when a call, Siri, or car Bluetooth
    // takes the mic mid-recording (seen live: minutes-long notes with no
    // sound). Surface it the moment it happens instead of after sending.
    const recWarn = document.getElementById('rec-warn');
    recWarn.hidden = true;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onmute = () => { recWarn.hidden = false; };
      track.onunmute = () => { recWarn.hidden = true; };
      track.onended = () => { recWarn.hidden = false; };
    }
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = recorder.mimeType || 'audio/mp4';
      const blob = new Blob(recChunks, { type });
      const seconds = recSeconds;
      recorder = null;
      recBar.hidden = true;
      clearInterval(recTimer);
      if (!recWanted || blob.size === 0) return;
      // A real recording runs tens of KB per second; a few hundred bytes per
      // second means the mic delivered no audio (interrupted session). Warn
      // before sending a note nobody will be able to hear.
      if (seconds > 2 && blob.size / seconds < 2000) {
        const send = confirm(
          'No sound was recorded, because the microphone is used by another program on your phone ' +
          '(Siri, CarPlay, car Bluetooth, a call, etc). Free up the microphone and record again. Send anyway?');
        if (!send) return;
      }
      const result = await uploadWithRetry('/api/chat/voice', { 'Content-Type': type, 'X-Rec-Seconds': String(seconds) }, blob);
      if (result.ok) {
        renderMessage(result.data.message);
      } else {
        alert('Could not send the voice note: ' + result.reason + '. Please try again.');
      }
    };
    recorder.start();
    recSeconds = 0;
    recTime.textContent = '0:00';
    recBar.hidden = false;
    recTimer = setInterval(() => {
      recSeconds++;
      // Members are capped at 10 minutes per voice note; the note auto-sends
      // at the cap and a new one can start right away.
      recTime.textContent = `${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, '0')} / 10:00`;
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

// Upload helper: retries once on server hiccups (deploy restarts, network
// blips) and reports the real reason on failure.
async function uploadWithRetry(url, headers, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res = null;
    try {
      res = await fetch(url, { method: 'POST', headers, body });
    } catch {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      return { ok: false, reason: 'no connection' };
    }
    if (res.ok) return { ok: true, data: await res.json() };
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    return { ok: false, reason: data.error || `server error ${res.status}` };
  }
  return { ok: false, reason: 'server unavailable' };
}

// --- Attachments ---
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { alert('Files up to 25 MB.'); return; }
  const result = await uploadWithRetry('/api/chat/file', {
    'Content-Type': file.type || 'application/octet-stream',
    'X-File-Name': encodeURIComponent(file.name),
  }, file);
  if (result.ok) {
    renderMessage(result.data.message);
  } else {
    alert(result.reason);
  }
});

// Android Chrome offers a real one-tap install; stash the event for the banner.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

// --- Push notifications ---
// Notifications are a key feature (founder ruling): the banner stays visible
// on every open until push is enabled OR the member deliberately turns it off
// with the bell toggle (ruling 17). An explicit off is respected, not nagged.
const PUSH_OFF_KEY = 'repairai.pushOff';
async function setupPush() {
  const banner = document.getElementById('push-banner');
  const bannerText = document.getElementById('push-banner-text');
  const enableBtn = document.getElementById('push-enable');
  const toggleBtn = document.getElementById('push-toggle');
  const bellOn = document.getElementById('bell-on');
  const bellOff = document.getElementById('bell-off');
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  // On iPhone every other browser (Chrome, the Google app, Firefox, Edge) is a
  // shell over Apple's engine, and only Safari can install home screen web
  // apps; email/social webviews carry no "Safari/" token at all. Real Safari
  // matches neither rule.
  const iosNonSafari = isIOS && /CriOS|FxiOS|EdgiOS|GSA\/|OPT\//.test(ua);
  const iosWebView = isIOS && !iosNonSafari && !/Safari\//.test(ua);
  const inApp = iosWebView || (!isIOS && /; wv\)|FBAN|FB_IAB|Instagram|Telegram|Line\//.test(ua));
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  // Android one-tap install when Chrome offers it.
  if (!standalone && !isIOS && installPrompt) {
    bannerText.textContent = 'Install Repair AI on your home screen to get message notifications.';
    enableBtn.hidden = false;
    enableBtn.textContent = 'Install app';
    banner.hidden = false;
    enableBtn.addEventListener('click', async function installOnce() {
      enableBtn.removeEventListener('click', installOnce);
      const prompt = installPrompt;
      installPrompt = null;
      if (prompt) {
        await prompt.prompt();
        await prompt.userChoice.catch(() => {});
      }
      location.reload();
    }, { once: true });
    return;
  }

  // Wrong surface for installing: in-app browsers anywhere, and non-Safari
  // browsers on iPhone. Steer to the right one before anything else.
  if (!standalone && (inApp || iosNonSafari)) {
    bannerText.textContent = isIOS
      ? 'On iPhone, installing Repair AI works only from Safari, even if you normally use Chrome or Google. ' +
        'Open Safari, go to otto.repairnow.app, sign in, then tap Share and Add to Home Screen.'
      : 'You are inside an email or social app. Open otto.repairnow.app in Chrome to install Repair AI and get notifications.';
    enableBtn.hidden = true;
    banner.hidden = false;
    return;
  }

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

  function setBell(state) {
    // state: 'on' | 'off' | null (hidden, push not possible here)
    toggleBtn.hidden = state === null;
    bellOn.hidden = state !== 'on';
    bellOff.hidden = state !== 'off';
    toggleBtn.classList.toggle('is-off', state === 'off');
    toggleBtn.setAttribute('aria-label', state === 'on' ? 'Turn off notifications' : 'Turn on notifications');
  }

  async function refreshUi() {
    if (!supported) {
      setBell(null);
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
    const optedOut = localStorage.getItem(PUSH_OFF_KEY) === '1';
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted' && !optedOut) {
      await syncSubscription(sub);
      setBell('on');
      banner.hidden = true;
      return;
    }
    setBell('off');
    if (optedOut) {
      // A deliberate choice: no nagging, the bell is the way back in.
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

  async function enablePush() {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        await syncSubscription(sub);
        localStorage.removeItem(PUSH_OFF_KEY);
      }
    } catch {}
    refreshUi();
  }

  async function disablePush() {
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } catch {}
    localStorage.setItem(PUSH_OFF_KEY, '1');
    refreshUi();
  }

  enableBtn.addEventListener('click', enablePush);
  toggleBtn.addEventListener('click', async () => {
    const sub = await reg.pushManager.getSubscription().catch(() => null);
    const isOn = sub && Notification.permission === 'granted' && localStorage.getItem(PUSH_OFF_KEY) !== '1';
    if (isOn) {
      if (confirm('Turn off notifications on this phone? You will not know when the group is talking.')) {
        await disablePush();
      }
    } else if (Notification.permission === 'denied') {
      localStorage.removeItem(PUSH_OFF_KEY);
      await refreshUi();
    } else {
      await enablePush();
    }
  });

  await refreshUi();
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
document.getElementById('signout-btn').addEventListener('click', async () => {
  if (!confirm('Sign out? You will need a new emailed code to sign back in.')) return;
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
});

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
