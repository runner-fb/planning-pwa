/* Beauregard V2 — service worker.
 * Rôle : servir la coquille (HTML/CSS/JS) même hors réseau.
 * L'API Apps Script n'est jamais mise en cache : ses appels sont en GET et
 * portent une action précise, un cache périmé serait dangereux.
 */
const SHELL = 'beauregard-v2-shell-4';
const SHELL_FILES = [
  './',
  './index.html',
  './base.css',
  './theme.css',
  './themes/2027/theme.css',
  './config.js',
  './js/boot.js',
  './js/queue.js',
  './js/transport.js',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  )
);

self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('beauregard-v2-shell-') && k !== SHELL)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
);

/* Réseau d'abord, cache en secours. Le clone est fait AVANT que la réponse
 * soit renvoyée à la page : un clone après consommation lève une erreur
 * et le document n'est plus jamais servi. */
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

  e.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          return caches
            .open(SHELL)
            .then((c) => c.put(req, copy))
            .catch(() => {})
            .then(() => response);
        }
        return response;
      })
      .catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ||
            (req.mode === 'navigate'
              ? caches.match('./index.html')
              : Promise.reject(new Error('hors ligne')))
        )
      )
  );
});
