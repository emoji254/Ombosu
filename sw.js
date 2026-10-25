const CACHE = 'nyaega-fdd8a54522ef';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-dark-192.png'];
const LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js","https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js","https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"];
self.addEventListener('install', e => {
  // No skipWaiting here: a new version waits until the coach taps "Reload to update".
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'cors', credentials: 'omit' }).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); })));
  }));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nyaega-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !LIBS.includes(req.url)) return;   // API calls and everything else go straight to the network
  if (req.mode === 'navigate'){ e.respondWith(caches.match('index.html').then(r => r || fetch(req))); return; }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});