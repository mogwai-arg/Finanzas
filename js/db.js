// =====================================================================
// db.js — capa de datos: Supabase + cache local + cola offline.
// supabase-js va empaquetado en vendor/ para que la PWA no dependa de
// ningun CDN y funcione tambien sin conexion.
// =====================================================================
import { normalizar } from './filas.js';
export { normalizar };

/**
 * Tablas que además del id tienen una clave natural única.
 *
 * Sin decirle esto a upsert, resuelve el conflicto SOLO por id: una fila
 * nueva para un (recurring_id, periodo) que ya existe con otro id choca
 * contra el unique, la escritura se encola, se reintenta cinco veces y
 * termina apartada. Y lo peor no es que falle: es que la app ya se había
 * pintado como si hubiera andado, así que el pago se veía hecho hasta que la
 * siguiente sincronización traía la fila vieja del servidor y el gasto fijo
 * volvía a aparecer pendiente, sin que nada dijera por qué.
 */
const CLAVE_NATURAL = {
  recurring_payments: 'recurring_id,periodo',
  recibos: 'user_id,periodo,concepto'
};

/**
 * Que tabla tiene que subir antes que cual.
 *
 * recurring_payments apunta a transactions por clave foranea: si la
 * transaccion no llego al servidor, el pago se rechaza aunque este perfecto.
 * Asi es como UN error se convertia en dos —nueve transacciones rechazadas
 * arrastraban siete pagos— y por que arreglar el primero no alcanzaba si el
 * segundo se intentaba antes.
 */
const ORDEN = ['accounts', 'categories', 'transactions', 'recurrings'];
const prioridad = t => { const i = ORDEN.indexOf(t); return i < 0 ? ORDEN.length : i; };

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
  'integrations', 'notificaciones', 'recibos', 'paritarias', 'sumas_nr',
  'push_subscriptions', 'settings'];

const CACHE_KEY = 'bishusha.cache.v1';
const COLA_KEY  = 'bishusha.cola.v1';
const ROTAS_KEY = 'bishusha.rotas.v1';
const MAX_INTENTOS = 5;

export const state = {
  user: null,
  accounts: [], categories: [], transactions: [], recurrings: [],
  recurring_payments: [], budgets: [], promos: [], promo_usos: [], promo_sucursales: [],
  reglas: [], integrations: [], notificaciones: [], recibos: [],
  paritarias: [], sumas_nr: [], push_subscriptions: [], settings: {},
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

/**
 * Lo que no se pudo guardar: lo apartado MAS lo que ya falló al menos una vez.
 *
 * Contar solo lo apartado hacía esto: tocabas "reintentar", las filas volvían
 * a la cola con el contador en cero, fallaban de nuevo y quedaban ahí con un
 * intento encima —fuera del cajón—, así que la pantalla decía "al día". A los
 * cinco intentos volvían a apartarse y aparecían otra vez, más que antes.
 * Tocar el botón parecía arreglarlo y empeorarlo al mismo tiempo.
 */
export const fallidas = () => [...leer(ROTAS_KEY),
                               ...leer(COLA_KEY).filter(op => (op.intentos || 0) > 0)];

const opcionesUpsert = tabla =>
  CLAVE_NATURAL[tabla] ? { onConflict: CLAVE_NATURAL[tabla] } : undefined;

/** Lo último que la base rechazó, para que la app lo pueda decir en voz alta. */
export const rechazos = new Set();
function rechazo(tabla, e) {
  const msg = String(e?.message || e);
  // Sin señal el fetch tira TypeError: eso es la cola haciendo su trabajo, no
  // un rechazo.
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return;
  state.rechazo = { tabla, error: msg, cuando: Date.now() };
  emit();
}

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

  // Primero las tablas de las que otras cuelgan: subir un pago antes que su
  // transaccion lo rechaza por clave foranea aunque el pago este bien.
  const cola = leer(COLA_KEY)
    .map((op, i) => [op, i])
    .sort((a, b) => (prioridad(a[0].tabla) - prioridad(b[0].tabla)) || (a[1] - b[1]))
    .map(([op]) => op);
  const quedan = [], rotas = leer(ROTAS_KEY);

  for (const op of cola) {
    try {
      // Se normaliza tambien al reintentar: las filas que quedaron trabadas
      // se guardaron antes de que existiera este filtro, y sin esto seguirian
      // fallando por el mismo campo de mas para siempre.
      const { error } = op.accion === 'upsert'
        ? await sb.from(op.tabla).upsert(normalizar(op.tabla, op.fila),
                                         opcionesUpsert(op.tabla))
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

// -------------------------------------------------------- integraciones
export const FUNCTIONS_URL = CFG.FUNCTIONS_URL || '';

/** El JWT de la sesion, que las Edge Functions necesitan para saber quien sos. */
export async function token() {
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || '';
}

/**
 * Manda al navegador a pedir el permiso.
 *
 * El JWT viaja en ?t= porque el que vuelve del proveedor es el navegador, no
 * la app: la funcion necesita saber de quien es la cuenta que autorizo.
 */
export async function conectar(proveedor) {
  if (!FUNCTIONS_URL) throw new Error('Falta FUNCTIONS_URL en la configuración.');
  const t = await token();
  if (!t) throw new Error('No hay sesión iniciada.');

  // Preguntar antes de mandar el navegador. Si la función no está desplegada,
  // Supabase contesta un JSON crudo en una pantalla en blanco y no hay vuelta
  // atrás: mejor decirlo acá, donde se entiende.
  try {
    const r = await fetch(`${FUNCTIONS_URL}/oauth-start`, { method: 'OPTIONS' });
    if (r.status === 404) throw new Error('falta');
  } catch (e) {
    if (e.message === 'falta') {
      // El panel de Supabase crea la funcion con un nombre al azar —'rapid-process'—
      // y ese nombre es la URL. Cambiarle la etiqueta despues no la mueve.
      throw new Error('No encuentro oauth-start. Fijate en Supabase → Edge Functions ' +
                      'que la URL termine exactamente en /oauth-start: si termina en ' +
                      'otra cosa, hay que borrarla y crearla de nuevo con ese nombre.');
    }
    // Cualquier otro problema de red no deberia frenar el intento.
  }

  // Borrar el error del intento anterior antes de salir: si no, al volver no
  // hay forma de saber si el cartel es de ahora o de la vez pasada.
  try { localStorage.removeItem('bishusha.oauth.error'); } catch { /* modo privado */ }

  location.href = `${FUNCTIONS_URL}/oauth-start?proveedor=${proveedor}&t=${encodeURIComponent(t)}`;
}

/** Corta la conexion sin borrar lo ya importado. */
export async function desconectar(proveedor) {
  const it = (state.integrations || []).find(x => x.proveedor === proveedor);
  if (!it) return;
  await guardar('integrations', { ...it, activo: false, access_token: null, refresh_token: null });
}

/** Pide una lectura ahora mismo, sin esperar al cron. */
export async function leerAhora(proveedor) {
  if (!FUNCTIONS_URL) throw new Error('Falta FUNCTIONS_URL en la configuración.');
  const t = await token();
  const r = await fetch(`${FUNCTIONS_URL}/${proveedor === 'gmail' ? 'gmail-sync' : 'mp-sync'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: state.user.id })
  });
  const texto = await r.text();
  if (r.status === 404) {
    // El JSON crudo de Supabase no dice que hacer. Es siempre lo mismo: la
    // funcion no esta publicada, o quedo con otro nombre —el panel les pone
    // uno al azar y ese nombre es la URL—.
    const cual = proveedor === 'gmail' ? 'gmail-sync' : 'mp-sync';
    throw new Error(`Falta subir la función ${cual}, o quedó publicada con otro nombre.`);
  }
  if (!r.ok) throw new Error(texto.slice(0, 200) || `Error ${r.status}`);
  await sincronizar();
  return texto;
}

/** Que hay en la bandeja y que haria la app con cada mail. No carga nada. */
export async function mirarBandeja() {
  if (!FUNCTIONS_URL) throw new Error('Falta FUNCTIONS_URL en la configuración.');
  const t = await token();
  const r = await fetch(`${FUNCTIONS_URL}/gmail-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: state.user.id, solo_ver: true })
  });
  if (r.status === 404) throw new Error('Falta subir gmail-sync, o quedó con otro nombre.');
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error('No pude leer la bandeja.');
  return d;
}

/**
 * Genera un par de claves para los avisos.
 *
 * Va por la función y no por el navegador porque el par tiene que salir del
 * mismo lugar que despues firma: asi no hay dos formatos posibles ni una
 * clave que parece bien y no verifica. No se guarda: se copia y se pega.
 */
export async function generarClavesAviso() {
  if (!FUNCTIONS_URL) throw new Error('Falta FUNCTIONS_URL en la configuración.');
  const t = await token();
  const r = await fetch(`${FUNCTIONS_URL}/cron-avisos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ claves: true })
  });
  if (r.status === 404) throw new Error('Falta subir cron-avisos, o quedó con otro nombre.');
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.VAPID_PUBLIC) throw new Error(d?.error || 'No pude generarlas.');
  return d;
}

/** Manda un aviso de prueba a este teléfono, para ver que llegue de verdad. */
export async function probarAviso() {
  if (!FUNCTIONS_URL) throw new Error('Falta FUNCTIONS_URL en la configuración.');
  const t = await token();
  const r = await fetch(`${FUNCTIONS_URL}/cron-avisos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ probar: true })
  });
  if (r.status === 404) throw new Error('Falta subir cron-avisos, o quedó con otro nombre.');
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error('No pude mandarlo.');
  return d;
}

/**
 * Las promos vigentes de un rubro: { promos, revision }.
 *
 * Devuelve el sobre entero y no solo la lista porque cuando la lista viene
 * vacia lo unico util es lo otro: que contesto el sitio.
 */
export async function traerPromos(rubro) {
  if (!FUNCTIONS_URL) throw new Error('Falta FUNCTIONS_URL en la configuración.');
  const t = await token();
  const r = await fetch(`${FUNCTIONS_URL}/promos-clash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rubro })
  });
  if (r.status === 404) throw new Error('Falta subir la función promos-clash.');
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || d.error) throw new Error(d?.error || 'No pude traer las promos.');
  return { promos: d.promos || [], revision: d.revision || null };
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
    // Si la consulta incremental falla —tipico: a la tabla le falta la
    // columna updated_at— se vuelve a pedir entera. Antes solo se anotaba el
    // error en la consola y esa tabla no llegaba nunca: nada se rompia a la
    // vista, simplemente faltaban datos.
    const traer = async t => {
      if (!desde) return await sb.from(t).select('*');
      const r = await sb.from(t).select('*').gt('updated_at', desde);
      if (!r.error) return r;
      console.warn(`${t}: sin updated_at, se pide entera`, r.error.message);
      return { ...(await sb.from(t).select('*')), completa: true };
    };
    const res = await Promise.all(TABLAS.map(traer));

    TABLAS.forEach((t, i) => {
      const { data, error, completa } = res[i] || {};
      if (error) { console.warn(t, error.message); return; }
      if (!data) return;
      if (t === 'settings') { if (data[0]) state.settings = data[0]; return; }
      if (!desde || completa) { state[t] = data; return; }
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
  const nueva = normalizar(tabla, fila);
  // settings tiene una fila por persona y su clave es user_id: agregarle un
  // id la manda contra una columna que no existe y el cambio queda trabado en
  // el cajon de fallidas sin que nada lo diga.
  if (!nueva.id && tabla !== 'settings') nueva.id = uuid();
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
      const { error } = await sb.from(tabla).upsert(nueva, opcionesUpsert(tabla));
      if (error) throw new Error(error.message);
    } catch (e) {
      encolar({ accion: 'upsert', tabla, fila: nueva });
      // Que la base RECHACE una fila no es lo mismo que estar sin señal, y se
      // veía igual: la pantalla decía "Guardado" y el cambio se deshacía solo
      // más tarde. Se avisa ahora, que es cuando todavía se puede hacer algo.
      if (navigator.onLine) rechazo(tabla, e);
    }
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
  const nuevas = filas.map(f => normalizar(tabla,
    { ...f, id: f.id || uuid(), user_id: state.user.id, updated_at: ahora }));

  // Se arma un mapa por id y se vuelca de nuevo a la lista.
  //
  // La version anterior guardaba las POSICIONES de cada id y despues hacia
  // unshift de las filas nuevas: cada unshift corre todo un lugar y las
  // posiciones guardadas dejan de apuntar a donde apuntaban. El resultado era
  // una fila que se actualizaba y ademas se duplicaba, con el mismo id dos
  // veces. Se vio importando un resumen sobre gastos ya anotados a mano.
  const lista = state[tabla] || (state[tabla] = []);
  const porId = new Map(lista.map(x => [x.id, x]));
  const agregadas = [];
  for (const n of nuevas) {
    if (porId.has(n.id)) porId.set(n.id, { ...porId.get(n.id), ...n });
    else { porId.set(n.id, n); agregadas.push(n.id); }
  }
  // Lo nuevo arriba, como cuando se guarda de a una.
  state[tabla] = [...agregadas.map(id => porId.get(id)),
                  ...lista.map(x => porId.get(x.id))];
  guardarCache(); emit();

  if (DEMO) return nuevas;
  if (navigator.onLine) {
    try {
      const { error } = await sb.from(tabla).upsert(nuevas, opcionesUpsert(tabla));
      if (error) throw new Error(error.message);
      return nuevas;
    } catch (e) { if (navigator.onLine) rechazo(tabla, e); }
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
