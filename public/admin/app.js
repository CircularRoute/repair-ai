// Admin shell, Phase 0: who am I, sign out, service worker registration.

async function init() {
  const res = await fetch('/api/me');
  if (!res.ok) { location.href = '/login'; return; }
  const me = await res.json();
  document.getElementById('whoami').textContent = me.name;
}

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/admin/sw.js');
}

init();
