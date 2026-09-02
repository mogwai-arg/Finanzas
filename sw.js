// =====================================================================
// Service worker: cache del shell + push de avisos.
//
// Dos cuidados que no son obvios:
//
//   1. Nunca guardar una respuesta redirigida. Cloudflare Pages contesta
//      /index.html con un 308 hacia /. Si esa respuesta queda en el cache y
//      despues se usa para una navegacion, el navegador la rechaza con
//      "Response served by service worker has redirections" y la app no
//      abre. Por eso todo lo que entra al cache pasa por limpiar().
//
//   2. Guardar de a uno. Con cache.addAll(), un solo archivo que falte tira
//      abajo la instalacion entera y el worker nuevo nunca reemplaza al
//      viejo. Aca cada archivo se guarda por separado.
// =====================================================================
const V = 'bishusha-v2';

const SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest',
  './css/app.css', './css/tokens.css',
  './js/app.js', './js/db.js', './js/filas.js', './js/finance.js', './js/formato.js',
  './js/geo.js', './js/resumen.js', './js/ruteo.js', './js/sueldo.js', './js/texto.js',
  './js/ui.js', './js/demo.js', './js/bishu.js', './js/push.js',
  './js/vistas/hoy.js', './js/vistas/revisar.js', './js/vistas/pago.js',
  './js/vistas/donde.js', './js/vistas/gastos.js', './js/vistas/tarjetas.js',
  './js/vistas/mes.js', './js/vistas/promos.js', './js/vistas/ajustes.js',
  './js/vistas/sueldo.js', './js/vistas/form-movimiento.js',
  './js/vistas/formularios.js', './js/vistas/importar.js',
  './vendor/supabase.js',
  // pdf.mjs y su worker NO van acá: pesan 1,7 MB entre los dos y solo hacen
  // falta al importar un resumen. Se guardan solos la primera vez que se
  // usan, con el mismo cache-first del resto.
  './marca/isotipo.svg', './icons/icon-192.png'
];

// Una respuesta redirigida no sirve para navegar: se copia el cuerpo a una
// respuesta limpia antes de guardarla o devolverla.
async function limpiar(r) {
  if (!r || !r.redirected) return r;
  const cuerpo = await r.blob();
  return new Response(cuerpo, { status: r.status, statusText: r.statusText, headers: r.headers });
}

async function guardar(cache, url) {
  try {
    const r = await fetch(new Request(url, { cache: 'reload', redirect: 'follow' }));
    if (r.ok) await cache.put(url, await limpiar(r));
  } catch { /* si falta uno, el resto igual se instala */ }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(V);
    await Promise.all(SHELL.map(u => guardar(cache, u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  // La API y Overpass siempre van a la red.
  if (u.hostname.includes('supabase') || u.hostname.includes('overpass')) return;

  // Abrir la app: red primero para tomar deploys nuevos, y el shell guardado
  // como red de seguridad. Siempre limpio, nunca una redireccion.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await limpiar(await fetch(req));
        if (r.ok) caches.open(V).then(c => c.put('./index.html', r.clone()));
        return r;
      } catch {
        const cache = await caches.open(V);
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('Sin conexión', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const r = await limpiar(await fetch(req));
      if (u.origin === location.origin && r.ok) {
        const copia = r.clone();
        caches.open(V).then(c => c.put(req, copia));
      }
      return r;
    } catch {
      const cache = await caches.open(V);
      return (await cache.match('./index.html')) ||
        new Response('Sin conexión', { status: 503, headers: { 'content-type': 'text/plain' } });
    }
  })());
});

self.addEventListener('push', e => {
  let d = { title: 'BISHUSHA', body: '' };
  try { d = e.data.json(); } catch { d.body = e.data && e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: d.tag || 'fin', data: { url: d.url || './#/hoy' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow(e.notification.data.url);
  }));
});
