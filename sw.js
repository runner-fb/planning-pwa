/* Beauregard V2 — service worker.
 * Rôle : servir la coquille (CSS/JS) hors réseau. L'API Apps Script n'est
 * jamais mise en cache. Le HTML est rafraîchi par le réseau et conservé
 * uniquement pour permettre un redémarrage hors ligne.
 */
const SHELL = 'beauregard-v2-shell-13-admin-ux';
const SHELL_FILES = [
  './',
  './index.html',
  './reception.html',
  './style.css',
  './base.css',
  './theme.css',
  './themes/2027/theme.css',
  './config.js',
  './js/boot.js',
  './js/queue.js',
  './js/transport.js',
  './js/screens-team.js',
  './js/screens-shifts.js',
  './app.js',
  './js/admin-ux.js',
  './assets/beauregard-2027.jpg',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.all(SHELL_FILES.map((f) => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('beauregard-') && k !== SHELL)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  /* Page HTML : réseau d'abord. Hors ligne, on retombe sur la copie connue,
   * et s'il n'y en a pas, on laisse le navigateur gérer son erreur. */
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {}); }
        return response;
      }).catch(() =>
        caches.match('./index.html').then((hit) => hit || caches.match('./'))
      )
    );
    return;
  }

  /* Ressources : réseau d'abord, cache en secours, sinon on laisse passer. */
  e.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(req).then((hit) => hit || fetch(req)))
  );
});
