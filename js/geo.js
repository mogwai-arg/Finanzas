// =====================================================================
// geo.js — ubicacion del telefono + busqueda de sucursales cercanas (OSM)
// Overpass API es gratuita y no necesita clave. Se cachea por 6 horas.
// =====================================================================

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const CACHE = 'fin.geo.v1';
const TTL = 6 * 60 * 60 * 1000;

export function posicion({ alta = true, maxEdad = 60000 } = {}) {
  return new Promise((ok, err) => {
    if (!navigator.geolocation) return err(new Error('Este dispositivo no comparte ubicacion'));
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      e => err(new Error(e.code === 1
        ? 'Permiso de ubicacion denegado. Activalo en el navegador para ver lo que tenes cerca.'
        : 'No se pudo obtener la ubicacion')),
      { enableHighAccuracy: alta, maximumAge: maxEdad, timeout: 12000 }
    );
  });
}

/** Distancia en metros entre dos coordenadas (haversine). */
export function distancia(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}
export const distanciaTexto = m =>
  m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

// ------------------------------------------------------------------ cache
const leerCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch { return {}; } };
const guardarCache = c => { try { localStorage.setItem(CACHE, JSON.stringify(c)); } catch {} };

/**
 * Busca comercios cerca de `centro` que matcheen la promo.
 * promo.osm_filtro: 'shop=supermarket' | 'amenity=pharmacy' | 'amenity=fuel' ...
 * promo.marcas: ['Farmacity','Simplicity'] -> filtra por name/brand
 */
export async function sucursalesCerca(promo, centro, radio = 3000) {
  const filtro = promo.osm_filtro;
  if (!filtro) return [];
  const [k, v] = filtro.split('=');
  const key = `${k}:${v}:${centro.lat.toFixed(3)}:${centro.lng.toFixed(3)}:${radio}`;
  const cache = leerCache();
  let elementos = cache[key] && (Date.now() - cache[key].t < TTL) ? cache[key].d : null;

  if (!elementos) {
    const q = `[out:json][timeout:20];
      ( node["${k}"="${v}"](around:${radio},${centro.lat},${centro.lng});
        way["${k}"="${v}"](around:${radio},${centro.lat},${centro.lng}); );
      out center tags 120;`;
    elementos = await consultar(q);
    cache[key] = { t: Date.now(), d: elementos };
    guardarCache(cache);
  }

  const marcas = (promo.marcas || []).map(m => m.toLowerCase());
  return elementos
    .map(e => {
      const t = e.tags || {};
      const nombre = t.name || t.brand || t.operator || 'Sin nombre';
      const p = { lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon };
      if (p.lat == null) return null;
      return {
        nombre,
        marca: t.brand || '',
        direccion: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
        abre: t.opening_hours || '',
        ...p,
        metros: distancia(centro, p)
      };
    })
    .filter(Boolean)
    .filter(s => !marcas.length ||
      marcas.some(m => (s.nombre + ' ' + s.marca).toLowerCase().includes(m)))
    .sort((a, b) => a.metros - b.metros)
    .slice(0, 12);
}

async function consultar(q) {
  let ultimo;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!r.ok) { ultimo = new Error('Overpass ' + r.status); continue; }
      const j = await r.json();
      return j.elements || [];
    } catch (e) { ultimo = e; }
  }
  console.warn('Overpass sin respuesta', ultimo);
  return [];
}

export const mapsUrl = s => `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
