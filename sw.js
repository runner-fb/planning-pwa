/* Beauregard V2 — service worker.
 * Rôle : servir la coquille (CSS/JS) hors réseau. L'API Apps Script n'est
 * jamais mise en cache. Le HTML est rafraîchi par le réseau et conservé
 * uniquement pour permettre un redémarrage hors ligne.
 */
const SHELL = 'beauregard-v2-shell-25-admin-workflow';
const SHELL_FILES = [
  './',
  './index.html',
  './reception.html',
  './style.css',
  './base.css',
  './theme.css',
  './themes/2027/theme.css?v=20261027-admin8',
  './config.js',
  './contact-photos.js',
  './js/boot.js',
  './js/queue.js?v=20261014-terrain',
  './js/transport.js',
  './js/screens-team.js',
  './js/screens-shifts.js',
  './app.js?v=20261027-admin8',
  './js/admin-ux.js?v=20261014-terrain',
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
  // Photos déjà consultées : conserver les originaux pour la consultation hors ligne.
  if (url.origin !== self.location.origin) {
    if(req.destination==='image' && url.protocol==='https:'){
      e.respondWith(caches.open('runner-contact-photos-v1').then(async cache=>{
        const local=await cache.match(req);if(local)return local;
        try {const response=await fetch(req);if(response.ok||response.type==='opaque'){await cache.put(req,response.clone());return response;}return (await cache.match(req))||response;}
        catch(error){const saved=await cache.match(req);if(saved)return saved;throw error;}
      }));
    }
    return;
  }

  // Coquille locale immédiate ; actualisation discrète pour la prochaine ouverture.
  e.respondWith(caches.open(SHELL).then(async cache => {
    const hit = await cache.match(req);
    const update = fetch(req).then(async response => {
      if(response.ok) await cache.put(req,response.clone());
      return response;
    });
    e.waitUntil(update.catch(()=>{}));
    if(hit) return hit;
    try{return await update;}catch(error){
      if(req.mode==='navigate')return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  }));
});
