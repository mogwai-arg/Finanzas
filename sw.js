// Service worker: cache del shell + push de avisos.
const V = 'fin-v1';
const SHELL = ['./', './index.html', './css/styles.css', './js/app.js', './js/db.js',
  './js/finance.js', './js/geo.js', './js/ui.js', './js/demo.js', './vendor/supabase.js', './config.js',
  './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // La API y Overpass siempre van a la red.
  if (u.hostname.includes('supabase') || u.hostname.includes('overpass')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (u.origin === location.origin && r.ok) {
        const copia = r.clone(); caches.open(V).then(c => c.put(e.request, copia));
      }
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});

self.addEventListener('push', e => {
  let d = { title: 'Finanzas', body: '' };
  try { d = e.data.json(); } catch { d.body = e.data && e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: d.tag || 'fin', data: { url: d.url || './index.html#/hoy' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow(e.notification.data.url);
  }));
});
