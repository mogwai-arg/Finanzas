// =====================================================================
// ruteo.js — navegacion por hash. Sin dependencias.
// =====================================================================
const oyentes = new Set();

export const rutaActual = () => (location.hash || '#/hoy').slice(1);
export const irA = ruta => { location.hash = ruta.startsWith('/') ? ruta : '/' + ruta; };
export const volver = () => history.length > 1 ? history.back() : irA('/hoy');
export function alCambiarRuta(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

window.addEventListener('hashchange', () => oyentes.forEach(f => f(rutaActual())));

/** '/tarjetas/abc' contra '/tarjetas/:id' -> { id: 'abc' } o null */
export function calzar(patron, ruta) {
  const p = patron.split('/').filter(Boolean);
  const r = ruta.split('?')[0].split('/').filter(Boolean);
  if (p.length !== r.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(r[i]);
    else if (p[i] !== r[i]) return null;
  }
  return params;
}
