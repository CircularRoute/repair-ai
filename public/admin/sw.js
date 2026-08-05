// Service worker, Phase 0: minimal, network-first. Exists so the PWA is
// installable; push handling arrives in Phase 1 with web-push.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
