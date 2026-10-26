/* Beauregard V2 — service worker.
 * Rôle : servir la coquille (CSS/JS) hors réseau. L'API Apps Script n'est
 * jamais mise en cache. Le HTML est rafraîchi par le réseau et conservé
 * uniquement pour permettre un redémarrage hors ligne.
 */
const SHELL = 'beauregard-v2-shell-17-volunteer-photos';
const SHELL_FILES = [
  './',
  './index.html',
  './reception.html',
  './style.css',
  './base.css',
  './theme.css',
  './themes/2027/theme.css?v=20261026-volunteer',
  './config.js',
  './js/boot.js',
  './js/queue.js?v=20261014-terrain',
  './js/transport.js',
  './js/screens-team.js',
  './js/screens-shifts.js',
  './app.js?v=20261026-volunteer',
  './js/admin-ux.js?v=20261014-terrain',
  './assets/beauregard-2027.jpg',
  './assets/1c6730949de4ee7a908a375483f7e729.png',
  './assets/fbb093512160732bdad41ac9fa153e32.png',
  './assets/a3e2db87b948ddb2c45d62f5814b62ae.JPG',

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
  // Photos déjà consultées : conserver les originaux pour la consultation hors ligne.
  if (url.origin !== self.location.origin) {
    if(req.destination==='image' && (url.hostname==='www.benevoles-beauregard.com'||url.hostname==='drive.google.com'||url.hostname.endsWith('.googleusercontent.com'))){
      e.respondWith(caches.open('runner-contact-photos-v1').then(async cache=>{
        try {const response=await fetch(req);if(response.ok||response.type==='opaque'){await cache.put(req,response.clone());return response;}return (await cache.match(req))||response;}
        catch(error){const saved=await cache.match(req);if(saved)return saved;throw error;}
      }));
    }
    return;
  }

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
