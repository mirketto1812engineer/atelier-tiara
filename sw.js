// Cache dell'app: aggiornata a ogni nuova versione pubblicata.
const CACHE = 'atelier-tiara-202611022337';
const FILES = [
 "./",
 "engine.js",
 "fonts/corinthia-700.ttf",
 "fonts/great-vibes-400.ttf",
 "fonts/liberation-serif-700.ttf",
 "fonts/parisienne-400.ttf",
 "fonts/pinyon-script-400.ttf",
 "fonts/tangerine-700.ttf",
 "icons/apple-touch-icon.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/maskable-512.png",
 "index.html",
 "lib/OrbitControls.js",
 "lib/RoomEnvironment.js",
 "lib/manifold.js",
 "lib/manifold.wasm",
 "lib/opentype.module.js",
 "lib/three.module.min.js",
 "manifest.webmanifest",
 "printers.js",
 "threemf.js",
 "worker.js",
 "zip.js"
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
  } else if (u.hostname.endsWith('fonts.googleapis.com') || u.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const r = await fetch(e.request); c.put(e.request, r.clone()); return r; } catch (err) { return new Response('', { status: 504 }); }
    }));
  }
});
