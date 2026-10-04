/* Beauregard V2 — service worker.
 * Deux rôles : la coquille (HTML/CSS/JS) et les données métier du dernier
 * bundle synchronisé, pour que l'application reste exploitable hors réseau.
 * L'API Apps Script n'est jamais mise en cache : ses appels sont en GET et
 * portent une action précise, un cache périmé serait dangereux.
 */
const SHELL = 'beauregard-v2-shell-2';
const SHELL_FILES = [
  './',
  './index.html',
  './base.css',
  './theme.css',
  './themes/2027/theme.css',
  './config.js',
  './js/transport.js',
  './app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) =>
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())
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

/* Les données viennent du cache applicatif (localStorage) côté app.js.
 * Ici on ne sert que la coquille, avec repli hors ligne sur index.html. */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) caches.open(SHELL).then((c) => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then((r) => r || caches.match('./index.html'))
      )
  );
});
