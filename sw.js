const CACHE = 'nyaega-24c782c4396e';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-dark-192.png'];
const LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js","https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js","https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"];
self.addEventListener('install', e => {
  // No skipWaiting here: a new version waits until the coach taps "Reload to update".
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    // The export libraries are fetched too, but one that fails (a bad connection, the CDN down) must not stop the app
    // from working offline: it is cached the first time it loads later (fetch below).
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'cors', credentials: 'omit' }).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})));
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
  if (LIBS.includes(req.url)){
    e.respondWith(caches.match(req.url).then(r => r || fetch(req).then(res => {
      if (!res.ok) return res;
      const copy = res.clone();
      return caches.open(CACHE).then(c => c.put(req.url, copy)).catch(() => {}).then(() => res);
    })));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});