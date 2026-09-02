// =====================================================================
// app.js — arranque, barra de pestañas y despacho de vistas.
// =====================================================================
import { h, icono, marca, aviso } from './ui.js';
import { state, sesion, sincronizar, cargarCache, onChange, DEMO,
         entrar, crearCuenta, recuperarPassword } from './db.js';
import { rutaActual, irA, alCambiarRuta, calzar } from './ruteo.js';
import { fechaLarga, hoyISO } from './formato.js';

import { vistaHoy } from './vistas/hoy.js';
import { vistaRevisar } from './vistas/revisar.js';
import { vistaPago } from './vistas/pago.js';
import { vistaDonde } from './vistas/donde.js';
import { vistaGastos } from './vistas/gastos.js';
import { vistaTarjetas, vistaTarjeta } from './vistas/tarjetas.js';
import { vistaPromos } from './vistas/promos.js';
import { vistaMes } from './vistas/mes.js';
import { vistaAjustes } from './vistas/ajustes.js';
import { vistaSueldo } from './vistas/sueldo.js';
import { formMovimiento } from './vistas/form-movimiento.js';

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');

// Cada entrada: patron -> { titulo, sub, vista, tab, atras, acciones }
const RUTAS = [
  ['/hoy',            { tab: 'hoy',      titulo: 'Hoy',        sub: () => fechaLarga(new Date()), vista: r => vistaHoy(r, { moneda: 'ARS' }), acciones: ['campana', 'ajustes'] }],
  ['/hoy/usd',        { tab: 'hoy',      titulo: 'Hoy',        sub: () => fechaLarga(new Date()), vista: r => vistaHoy(r, { moneda: 'USD' }), acciones: ['campana', 'ajustes'] }],
  ['/revisar',        { tab: 'hoy',      titulo: 'Revisar',    vista: vistaRevisar, atras: true }],
  ['/pago',           { tab: 'hoy',      titulo: '¿Con qué pago?', vista: vistaPago, atras: true }],
  ['/donde',          { tab: 'hoy',      titulo: 'Dónde está', vista: vistaDonde, atras: true, acciones: ['ojo'] }],
  ['/mes',            { tab: 'hoy',      titulo: 'El mes',     vista: vistaMes, atras: true }],
  ['/sueldo',         { tab: 'hoy',      titulo: 'Sueldo',     sub: 'Recibos, paritarias y proyección', vista: vistaSueldo, atras: true }],
  ['/gastos',         { tab: 'gastos',   titulo: 'Gastos',     vista: vistaGastos, acciones: ['buscar'] }],
  ['/tarjetas',       { tab: 'tarjetas', titulo: 'Tarjetas',   vista: vistaTarjetas }],
  ['/tarjetas/:id',   { tab: 'tarjetas', titulo: 'Tarjeta',    vista: vistaTarjeta, atras: true }],
  ['/promos',         { tab: 'promos',   titulo: 'Promos',     vista: vistaPromos }],
  ['/ajustes',        { tab: null,       titulo: 'Ajustes',    vista: vistaAjustes, atras: true }]
];

const TABS = [
  { id: 'hoy',      ruta: '/hoy',      icono: 'casa',    label: 'Hoy' },
  { id: 'gastos',   ruta: '/gastos',   icono: 'lista',   label: 'Gastos' },
  { id: 'nuevo',    accion: () => formMovimiento(), icono: 'mas', fab: true, label: 'Cargar' },
  { id: 'tarjetas', ruta: '/tarjetas', icono: 'tarjeta', label: 'Tarjetas' },
  { id: 'promos',   ruta: '/promos',   icono: 'pin',     label: 'Promos' }
];

// ------------------------------------------------------------ arranque
/** Texto de la pantalla de arranque. Decir en qué anda vale más que un spinner. */
const decirEstado = txt => {
  const e = document.getElementById('splash-estado');
  if (e) e.textContent = txt;
};

async function iniciar() {
  aplicarTema();
  servicioOffline();

  // Si tarda, avisar en vez de dejar la marca latiendo sin explicación.
  const lento = setTimeout(() => {
    const e = document.getElementById('splash-estado');
    if (!e) return;
    e.classList.add('lento');
    e.textContent = navigator.onLine
      ? 'Está tardando más de lo normal. Seguí esperando o recargá.'
      : 'Sin conexión. Voy a mostrarte lo último que guardé.';
  }, 5000);

  let usuario = null;
  try { usuario = await sesion(); }
  catch (e) { console.warn('sesion', e); }
  clearTimeout(lento);

  if (!usuario) { pantallaLogin(); return; }

  decirEstado('Leyendo lo guardado…');
  const habiaCache = cargarCache();
  render();
  tabs.hidden = false;
  onChange(render);
  alCambiarRuta(() => { window.scrollTo(0, 0); render(); });

  // El primer arranque no tiene caché: ahí sí se espera a que baje todo.
  if (!habiaCache) {
    decirEstado('Trayendo tus datos…');
    await sincronizar().catch(e => console.warn('sync', e));
    render();
  } else {
    sincronizar().catch(e => console.warn('sync', e));
  }

}

// Se registra siempre, aun sin sesión: si sólo corriera después del login,
// una versión vieja del worker se quedaría atendiendo para siempre a quien no
// llegó a entrar.
function servicioOffline() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const habia = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Con un worker nuevo al mando conviene recargar una vez, para no quedar
    // con la mitad de la app vieja y la mitad nueva. En la primera visita no
    // hace falta: no había nada que reemplazar.
    if (!habia || recargando) return;
    recargando = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Al volver a la app, preguntar si hay una version nueva publicada. Sin
    // esto un deploy puede tardar en aparecer en un telefono que nunca cierra
    // la pestaña.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}

function aplicarTema() {
  const t = localStorage.getItem('bishusha.tema');
  if (t) document.documentElement.setAttribute('data-tema', t);
  if (localStorage.getItem('bishusha.ocultar') === '1') state.ocultarMontos = true;
}

// -------------------------------------------------------------- render
function render() {
  const ruta = rutaActual();
  let def = null, params = {};
  for (const [patron, d] of RUTAS) {
    const m = calzar(patron, ruta);
    if (m) { def = d; params = m; break; }
  }
  if (!def) { irA('/hoy'); return; }

  app.replaceChildren();
  app.append(cabecera(def, params));
  const cuerpo = h('div');
  app.append(cuerpo);
  try {
    def.vista(cuerpo, params);
  } catch (e) {
    console.error(e);
    cuerpo.append(h('div.vacio',
      h('div.ic', icono('rayo', 24)),
      h('h3', 'Algo se rompió acá'),
      h('p', 'Probá recargar. Si sigue pasando, contámelo.')));
  }
  pintarTabs(def.tab);
}

function cabecera(def, params) {
  const titulo = typeof def.titulo === 'function' ? def.titulo(params) : def.titulo;
  const sub = typeof def.sub === 'function' ? def.sub(params) : def.sub;
  const acciones = h('div.act');

  for (const a of def.acciones || []) {
    if (a === 'campana') {
      const n = state.transactions.filter(t => t.revisado === false).length;
      acciones.append(h('button.iconbtn', { 'aria-label': 'Avisos', onclick: () => irA('/revisar') },
        icono('campana', 19), n > 0 && h('span.badge', String(n))));
    }
    if (a === 'ajustes') acciones.append(h('button.iconbtn',
      { 'aria-label': 'Ajustes', onclick: () => irA('/ajustes') }, icono('ajustes', 19)));
    if (a === 'ojo') acciones.append(h('button.iconbtn', {
      'aria-label': state.ocultarMontos ? 'Mostrar montos' : 'Ocultar montos',
      'aria-pressed': String(!!state.ocultarMontos),
      onclick: () => {
        state.ocultarMontos = !state.ocultarMontos;
        localStorage.setItem('bishusha.ocultar', state.ocultarMontos ? '1' : '0');
        render();
      }
    }, icono(state.ocultarMontos ? 'ojoNo' : 'ojo', 19)));
    if (a === 'buscar') acciones.append(h('button.iconbtn',
      { 'aria-label': 'Filtrar', onclick: () => document.querySelector('.search input')?.focus() },
      icono('filtro', 19)));
  }

  return h('header.nav',
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: '0' } },
      def.atras && h('button.iconbtn', {
        'aria-label': 'Volver', style: { marginLeft: '-12px', width: '36px' },
        onclick: () => history.length > 1 ? history.back() : irA('/hoy')
      }, h('span', { style: { transform: 'rotate(180deg)', display: 'grid' } }, icono('chev', 20))),
      h('div', h('h1', titulo), sub && h('div.sub', sub))),
    acciones);
}

function pintarTabs(activo) {
  tabs.replaceChildren();
  for (const t of TABS) {
    if (t.fab) {
      tabs.append(h('button.tab', { 'aria-label': t.label, onclick: t.accion },
        h('span.fab', icono(t.icono, 21))));
      continue;
    }
    tabs.append(h('button.tab', {
      'aria-current': activo === t.id ? 'page' : null,
      onclick: () => irA(t.ruta)
    }, icono(t.icono, 21), h('span', t.label)));
  }
}

// --------------------------------------------------------------- login

/**
 * Un error de login sin explicacion es lo peor que puede pasar en la primera
 * pantalla: no hay nada que probar y no se sabe si es la app, la clave o la
 * conexion. Por eso el mensaje dice QUE paso y QUE hacer.
 */
function explicarError(error, modo) {
  const m = String(error?.message || error || '').toLowerCase();
  if (/invalid login|invalid credentials/.test(m))
    return 'Ese correo y esa contraseña no coinciden. Si nunca entraste, creá la cuenta.';
  if (/email not confirmed/.test(m))
    return 'La cuenta existe pero falta confirmarla. En Supabase, Authentication → Providers → '
         + 'Email, desactivá "Confirm email".';
  if (/already registered|already exists|user already/.test(m))
    return 'Ese correo ya tiene cuenta. Entrá con tu contraseña, o recuperala si la olvidaste.';
  if (/password should be|at least|weak/.test(m))
    return 'La contraseña es muy corta. Poné al menos seis caracteres.';
  if (/rate|too many|seconds|limit/.test(m))
    return 'Demasiados intentos seguidos. Esperá un minuto.';
  if (/signup.*disabled|not allowed/.test(m))
    return 'Supabase no está aceptando altas. Activá "Allow new users to sign up".';
  if (/fetch|network|failed to fetch/.test(m))
    return 'No pude hablar con el servidor. ¿Hay internet?';
  return error?.message || 'No salió, y el servidor no dijo por qué.';
}

function pantallaLogin() {
  tabs.hidden = true;
  let modo = 'entrar';          // entrar | crear
  let ocupado = false;

  const email = h('input', { type: 'email', placeholder: 'tu@correo.com',
                             autocomplete: 'username', inputmode: 'email',
                             autocapitalize: 'none', spellcheck: 'false' });
  const clave = h('input', { type: 'password', placeholder: '••••••••',
                             autocomplete: 'current-password' });
  const verClave = h('button.iconbtn', {
    type: 'button', 'aria-label': 'Ver la contraseña',
    style: { position: 'absolute', right: '2px', top: '2px', width: '44px', height: '44px' },
    onclick: () => {
      clave.type = clave.type === 'password' ? 'text' : 'password';
      verClave.replaceChildren(icono(clave.type === 'password' ? 'ojo' : 'ojoNo', 18));
    }
  }, icono('ojo', 18));

  const mensaje = h('div', { hidden: true, style: { marginTop: '14px', textAlign: 'left' } });
  const boton = h('button.btn');
  const cambiar = h('button', {
    style: { background: 'none', border: '0', color: 'var(--brand)', font: 'inherit',
             fontSize: '14px', fontWeight: '600', cursor: 'pointer', padding: '10px',
             marginTop: '4px' },
    onclick: () => { modo = modo === 'entrar' ? 'crear' : 'entrar'; mensaje.hidden = true; pintar(); }
  });
  const olvide = h('button', {
    style: { background: 'none', border: '0', color: 'var(--tx2)', font: 'inherit',
             fontSize: '13.5px', cursor: 'pointer', padding: '8px' },
    onclick: async () => {
      if (!email.value.includes('@')) { email.focus(); mostrar('amb', 'Poné tu correo primero.'); return; }
      const { error } = await recuperarPassword(email.value);
      mostrar(error ? 'amb' : 'bra', error ? explicarError(error, modo)
        : 'Te mandé un correo para poner una contraseña nueva. Abrilo desde este aparato.');
    }
  }, 'Olvidé la contraseña');

  const mostrar = (tono, txt) => {
    mensaje.hidden = false;
    mensaje.replaceChildren(h('div', { class: `aviso ${tono}`, style: { display: 'block' } },
      h('div.ds', { style: { color: tono === 'amb' ? 'var(--amb)' : 'var(--tx2)' } }, txt)));
  };

  function pintar() {
    const crear = modo === 'crear';
    boton.textContent = crear ? 'Crear cuenta' : 'Entrar';
    clave.autocomplete = crear ? 'new-password' : 'current-password';
    clave.placeholder = crear ? 'al menos 6 caracteres' : '••••••••';
    cambiar.textContent = crear ? 'Ya tengo cuenta' : 'Es la primera vez: crear cuenta';
    olvide.hidden = crear;
  }

  boton.onclick = async () => {
    if (ocupado) return;
    if (!email.value.includes('@')) { email.focus(); mostrar('amb', 'Falta el correo.'); return; }
    if (clave.value.length < 6) { clave.focus(); mostrar('amb', 'La contraseña va de seis caracteres para arriba.'); return; }

    ocupado = true; boton.disabled = true;
    boton.textContent = modo === 'crear' ? 'Creando…' : 'Entrando…';
    mensaje.hidden = true;

    let error = null, data = null;
    try {
      ({ data, error } = modo === 'crear'
        ? await crearCuenta(email.value, clave.value)
        : await entrar(email.value, clave.value));
    } catch (e) { error = e; }

    ocupado = false; boton.disabled = false; pintar();

    if (error) { mostrar('amb', explicarError(error, modo)); return; }
    if (modo === 'crear' && !data?.session) {
      mostrar('bra', 'Cuenta creada. Te mandé un correo para confirmarla; abrilo y volvé a entrar.');
      return;
    }
    location.reload();
  };

  pintar();

  app.replaceChildren(h('div', { style: { maxWidth: '340px', margin: '14vh auto 0',
                                          textAlign: 'center' } },
    marca(52),
    h('h1', { style: { fontFamily: 'var(--f-display)', fontSize: '30px', fontWeight: '800',
                       letterSpacing: '-.05em', margin: '16px 0 24px' } }, 'BISHUSHA'),
    h('form', { style: { textAlign: 'left' },
                onsubmit: e => { e.preventDefault(); boton.click(); } },
      h('div.f', h('label', 'Correo'), email),
      h('div.f', h('label', 'Contraseña'),
        h('div', { style: { position: 'relative' } }, clave, verClave)),
      boton),
    mensaje,
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
      cambiar, olvide)));

  setTimeout(() => email.focus(), 120);
}

iniciar();
