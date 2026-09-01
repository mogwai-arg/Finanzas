// =====================================================================
// db.js — capa de datos: Supabase + cache local + cola offline
// =====================================================================
// supabase-js va empaquetado en vendor/ para que la PWA no dependa de
// ningun CDN y funcione tambien sin conexion.
const CFG = window.CONFIG || {};
export const DEMO = !!CFG.DEMO;

const stub = {
  auth: { getSession: async () => ({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithOtp: async () => ({ error: null }), signOut: async () => {} },
  from: () => ({ select: async () => ({ data: [] }), upsert: async () => ({}),
                 delete: () => ({ eq: async () => ({}) }) })
};
export const sb = DEMO ? stub
  : (await import('../vendor/supabase.js')).createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

export const TABLAS = ['accounts', 'categories', 'transactions', 'recurrings',
  'recurring_payments', 'budgets', 'promos', 'promo_sucursales', 'reglas',
  'integrations', 'notificaciones', 'settings'];

const CACHE_KEY = 'fin.cache.v1';
const COLA_KEY = 'fin.cola.v1';

export const state = {
  user: null,
  accounts: [], categories: [], transactions: [], recurrings: [],
  recurring_payments: [], budgets: [], promos: [], promo_sucursales: [],
  reglas: [], integrations: [], notificaciones: [], settings: {},
  online: navigator.onLine, sincronizando: false, ultimaSync: null
};

const subs = new Set();
export const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };
export const emit = () => subs.forEach(fn => fn());

// ------------------------------------------------------------------ cache
function guardarCache() {
  try {
    const d = {};
    for (const t of TABLAS) d[t] = state[t];
    d.ultimaSync = state.ultimaSync;
    localStorage.setItem(CACHE_KEY, JSON.stringify(d));
  } catch (e) { console.warn('cache', e); }
}
export function cargarCache() {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!d) return false;
    for (const t of TABLAS) if (d[t]) state[t] = d[t];
    state.ultimaSync = d.ultimaSync || null;
    return true;
  } catch { return false; }
}

// ------------------------------------------------------------- cola offline
const leerCola = () => JSON.parse(localStorage.getItem(COLA_KEY) || '[]');
const escribirCola = c => localStorage.setItem(COLA_KEY, JSON.stringify(c));
export const pendientes = () => leerCola().length;

function encolar(op) { const c = leerCola(); c.push(op); escribirCola(c); }

export async function flushCola() {
  if (!navigator.onLine) return;
  let cola = leerCola();
  while (cola.length) {
    const op = cola[0];
    try {
      if (op.accion === 'upsert') await sb.from(op.tabla).upsert(op.fila);
      else if (op.accion === 'delete') await sb.from(op.tabla).delete().eq('id', op.id);
    } catch (e) { console.warn('cola bloqueada', e); return; }
    cola.shift(); escribirCola(cola);
  }
}

// ------------------------------------------------------------------- auth
export async function sesion() {
  if (DEMO) {
    state.user = { id: 'demo', email: 'modo demo' };
    if (!cargarCache()) {
      const { DEMO: datos } = await import('./demo.js');
      for (const t of TABLAS) if (datos[t]) state[t] = structuredClone(datos[t]);
      guardarCache();
    }
    return state.user;
  }
  const { data } = await sb.auth.getSession();
  state.user = data.session?.user || null;
  return state.user;
}
export async function enviarMagicLink(email) {
  return sb.auth.signInWithOtp({
    email, options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
}
export async function salir() {
  await sb.auth.signOut();
  localStorage.removeItem(CACHE_KEY);
  state.user = null;
}

// ------------------------------------------------------------------- sync
export async function sincronizar() {
  if (DEMO) { state.ultimaSync = new Date().toISOString(); return; }
  if (!state.user || state.sincronizando) return;
  state.sincronizando = true; emit();
  try {
    await flushCola();
    const res = await Promise.all(TABLAS.map(t => sb.from(t).select('*')));
    TABLAS.forEach((t, i) => {
      const { data, error } = res[i];
      if (error) { console.warn(t, error.message); return; }
      state[t] = t === 'settings' ? (data[0] || {}) : data;
    });
    state.ultimaSync = new Date().toISOString();
    guardarCache();
  } finally {
    state.sincronizando = false; emit();
  }
}

// -------------------------------------------------------------- escritura
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    }));

/** Guarda una fila (crea o actualiza) con escritura optimista. */
export async function guardar(tabla, fila) {
  const nueva = { ...fila };
  if (!nueva.id) nueva.id = uuid();
  nueva.user_id = state.user.id;

  const lista = state[tabla];
  if (tabla === 'settings') state.settings = { ...state.settings, ...nueva };
  else {
    const i = lista.findIndex(x => x.id === nueva.id);
    if (i >= 0) lista[i] = { ...lista[i], ...nueva }; else lista.unshift(nueva);
  }
  guardarCache(); emit();

  if (DEMO) return nueva;
  if (navigator.onLine) {
    const { error } = await sb.from(tabla).upsert(nueva);
    if (error) { console.warn('upsert', tabla, error.message); encolar({ accion: 'upsert', tabla, fila: nueva }); }
  } else encolar({ accion: 'upsert', tabla, fila: nueva });
  return nueva;
}

export async function borrar(tabla, id) {
  state[tabla] = state[tabla].filter(x => x.id !== id);
  guardarCache(); emit();
  if (DEMO) return;
  if (navigator.onLine) {
    const { error } = await sb.from(tabla).delete().eq('id', id);
    if (error) encolar({ accion: 'delete', tabla, id });
  } else encolar({ accion: 'delete', tabla, id });
}

// ------------------------------------------------------------------ export
export function exportarJSON() {
  const d = { exportado: new Date().toISOString(), version: 1 };
  for (const t of TABLAS) { if (t === 'integrations') continue; d[t] = state[t]; }
  return JSON.stringify(d, null, 2);
}

export async function importarJSON(texto) {
  const d = JSON.parse(texto);
  let n = 0;
  for (const t of TABLAS) {
    if (t === 'integrations' || !Array.isArray(d[t])) continue;
    for (const fila of d[t]) { await guardar(t, { ...fila, user_id: state.user.id }); n++; }
  }
  await sincronizar();
  return n;
}

window.addEventListener('online', () => { state.online = true; emit(); sincronizar(); });
window.addEventListener('offline', () => { state.online = false; emit(); });
