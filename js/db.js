// =====================================================================
// db.js — capa de datos: Supabase + cache local + cola offline.
// supabase-js va empaquetado en vendor/ para que la PWA no dependa de
// ningun CDN y funcione tambien sin conexion.
// =====================================================================
const CFG = window.CONFIG || {};
export const DEMO = !!CFG.DEMO;

const stub = {
  auth: { getSession: async () => ({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithPassword: async () => ({ data: {}, error: null }),
          signUp: async () => ({ data: {}, error: null }),
          resetPasswordForEmail: async () => ({ error: null }),
          updateUser: async () => ({ error: null }), signOut: async () => {} },
  from: () => ({ select: () => ({ gt: async () => ({ data: [] }), then: r => r({ data: [] }) }),
                 upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) })
};
export const sb = DEMO ? stub
  : (await import('../vendor/supabase.js')).createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

export const TABLAS = ['accounts', 'categories', 'transactions', 'recurrings',
  'recurring_payments', 'budgets', 'promos', 'promo_usos', 'promo_sucursales', 'reglas',
  'integrations', 'notificaciones', 'recibos', 'paritarias', 'sumas_nr', 'settings'];

const CACHE_KEY = 'bishusha.cache.v1';
const COLA_KEY  = 'bishusha.cola.v1';
const ROTAS_KEY = 'bishusha.rotas.v1';
const MAX_INTENTOS = 5;

export const state = {
  user: null,
  accounts: [], categories: [], transactions: [], recurrings: [],
  recurring_payments: [], budgets: [], promos: [], promo_usos: [], promo_sucursales: [],
  reglas: [], integrations: [], notificaciones: [], recibos: [],
  paritarias: [], sumas_nr: [], settings: {},
  online: navigator.onLine, sincronizando: false, ultimaSync: null,
  ocultarMontos: false
};

const subs = new Set();
export const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };
export const emit = () => subs.forEach(fn => fn());

// ------------------------------------------------------------------ cache
function guardarCache() {
  try {
    const d = { ultimaSync: state.ultimaSync };
    for (const t of TABLAS) d[t] = state[t];
    localStorage.setItem(CACHE_KEY, JSON.stringify(d));
  } catch (e) { console.warn('cache lleno', e); }
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
const leer = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const pendientes = () => leer(COLA_KEY).length;
export const fallidas   = () => leer(ROTAS_KEY);

function encolar(op) {
  const c = leer(COLA_KEY);
  // Una fila que se guarda dos veces no necesita subir dos veces.
  const i = c.findIndex(x => x.accion === op.accion && x.tabla === op.tabla &&
                             (x.fila?.id || x.id) === (op.fila?.id || op.id));
  if (i >= 0) c[i] = { ...op, intentos: c[i].intentos || 0 }; else c.push({ ...op, intentos: 0 });
  escribir(COLA_KEY, c);
}

/**
 * Vacia la cola de escrituras pendientes.
 *
 * La version anterior hacia `return` en el catch: UNA fila que fallara
 * congelaba la sincronizacion para siempre, y con ella toda la app. Ahora
 * cada operacion se reintenta hasta cinco veces y despues se aparta en un
 * cajon de fallidas que se puede ver y reintentar desde Ajustes. La cola
 * nunca se bloquea, y nada se pierde en silencio.
 */
export async function flushCola({ reintentarFallidas = false } = {}) {
  if (DEMO || !navigator.onLine) return;
  if (reintentarFallidas) {
    const rotas = leer(ROTAS_KEY);
    if (rotas.length) {
      escribir(COLA_KEY, [...leer(COLA_KEY), ...rotas.map(r => ({ ...r, intentos: 0 }))]);
      escribir(ROTAS_KEY, []);
    }
  }

  let cola = leer(COLA_KEY);
  const quedan = [], rotas = leer(ROTAS_KEY);

  for (const op of cola) {
    try {
      const { error } = op.accion === 'upsert'
        ? await sb.from(op.tabla).upsert(op.fila)
        : await sb.from(op.tabla).delete().eq('id', op.id);
      if (error) throw new Error(error.message);
    } catch (e) {
      const intentos = (op.intentos || 0) + 1;
      if (intentos >= MAX_INTENTOS) {
        rotas.push({ ...op, intentos, error: String(e.message || e), cuando: new Date().toISOString() });
        console.warn('operacion apartada tras', intentos, 'intentos', op.tabla, e);
      } else {
        quedan.push({ ...op, intentos });
      }
    }
  }
  escribir(COLA_KEY, quedan);
  escribir(ROTAS_KEY, rotas);
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
/**
 * Correo y contrasena, no link magico.
 *
 * El link magico se veia mas prolijo pero traia dos problemas reales: el
 * correo incluido de Supabase corta a los pocos envios por hora, y en el
 * celular el link abre en Safari mientras la app instalada queda afuera —
 * la sesion queda de un lado y vos del otro. Con contrasena no se manda
 * ningun correo al entrar, y el llavero del telefono la recuerda.
 */
export const entrar = (email, password) =>
  sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });

export const crearCuenta = (email, password) =>
  sb.auth.signUp({ email: email.trim().toLowerCase(), password,
                   options: { emailRedirectTo: urlDeVuelta() } });

/** La unica vez que se manda un correo: cuando de verdad hace falta. */
export const recuperarPassword = email =>
  sb.auth.resetPasswordForEmail(email.trim().toLowerCase(),
    { redirectTo: urlDeVuelta() });

export const cambiarPassword = password => sb.auth.updateUser({ password });

/** Adonde vuelve el correo de recuperacion. Siempre la raiz del sitio. */
export const urlDeVuelta = () =>
  location.origin + location.pathname.replace(/index\.html$/, '');
export async function salir() {
  await sb.auth.signOut();
  localStorage.removeItem(CACHE_KEY);
  state.user = null;
}

// ------------------------------------------------------------------- sync
/**
 * Sincroniza por DIFERENCIA, no bajando las tablas enteras.
 *
 * La version anterior hacia select('*') de las doce tablas en cada arranque.
 * A los dos años son miles de filas en cada apertura. Con `updated_at` en
 * todas las tablas (migracion 003) alcanza con pedir lo que cambio.
 */
export async function sincronizar(opciones = {}) {
  if (DEMO) { state.ultimaSync = new Date().toISOString(); return; }
  if (!state.user || state.sincronizando) return;
  state.sincronizando = true; emit();
  const desde = opciones.completa ? null : state.ultimaSync;
  const empezo = new Date().toISOString();

  try {
    await flushCola(opciones);
    const res = await Promise.all(TABLAS.map(t => {
      const q = sb.from(t).select('*');
      return desde ? q.gt('updated_at', desde) : q;
    }));

    TABLAS.forEach((t, i) => {
      const { data, error } = res[i] || {};
      if (error) { console.warn(t, error.message); return; }
      if (!data) return;
      if (t === 'settings') { if (data[0]) state.settings = data[0]; return; }
      if (!desde) { state[t] = data; return; }
      // Diferencial: se pisa lo que cambio y se agrega lo nuevo.
      const idx = new Map(state[t].map(f => [f.id, f]));
      for (const fila of data) idx.set(fila.id, fila);
      state[t] = [...idx.values()];
    });
    state.ultimaSync = empezo;
    guardarCache();
  } catch (e) {
    console.warn('sync', e);
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
  nueva.updated_at = new Date().toISOString();

  if (tabla === 'settings') state.settings = { ...state.settings, ...nueva };
  else {
    const lista = state[tabla] || (state[tabla] = []);
    const i = lista.findIndex(x => x.id === nueva.id);
    if (i >= 0) lista[i] = { ...lista[i], ...nueva }; else lista.unshift(nueva);
  }
  guardarCache(); emit();

  if (DEMO) return nueva;
  if (navigator.onLine) {
    try {
      const { error } = await sb.from(tabla).upsert(nueva);
      if (error) throw new Error(error.message);
    } catch (e) { encolar({ accion: 'upsert', tabla, fila: nueva }); }
  } else encolar({ accion: 'upsert', tabla, fila: nueva });
  return nueva;
}

/**
 * Guarda muchas filas de una vez: una sola pasada por el estado, un solo
 * repintado y un solo viaje a la red.
 *
 * Hacerlo con guardar() en un for era medio minuto de espera para cincuenta
 * filas —cincuenta viajes de ida y vuelta, y cincuenta repintados que dejaban
 * la pantalla como si no pasara nada— y encima si el quinto fallaba los
 * cuatro primeros ya estaban subidos.
 */
export async function guardarVarios(tabla, filas) {
  if (!filas.length) return [];
  const ahora = new Date().toISOString();
  const nuevas = filas.map(f => ({ ...f, id: f.id || uuid(), user_id: state.user.id, updated_at: ahora }));

  const lista = state[tabla] || (state[tabla] = []);
  const porId = new Map(lista.map((x, i) => [x.id, i]));
  for (const n of nuevas) {
    const i = porId.get(n.id);
    if (i >= 0) lista[i] = { ...lista[i], ...n }; else lista.unshift(n);
  }
  guardarCache(); emit();

  if (DEMO) return nuevas;
  if (navigator.onLine) {
    try {
      const { error } = await sb.from(tabla).upsert(nuevas);
      if (error) throw new Error(error.message);
      return nuevas;
    } catch (e) { /* abajo se encolan */ }
  }
  for (const n of nuevas) encolar({ accion: 'upsert', tabla, fila: n });
  return nuevas;
}

export async function borrar(tabla, id) {
  state[tabla] = (state[tabla] || []).filter(x => x.id !== id);
  guardarCache(); emit();
  if (DEMO) return;
  if (navigator.onLine) {
    try {
      const { error } = await sb.from(tabla).delete().eq('id', id);
      if (error) throw new Error(error.message);
    } catch { encolar({ accion: 'delete', tabla, id }); }
  } else encolar({ accion: 'delete', tabla, id });
}

// ------------------------------------------------------------------ export
export function exportarJSON() {
  const d = { app: 'bishusha', exportado: new Date().toISOString(), version: 2 };
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
  await sincronizar({ completa: true });
  return n;
}

addEventListener('online', () => { state.online = true; emit(); sincronizar(); });
addEventListener('offline', () => { state.online = false; emit(); });
