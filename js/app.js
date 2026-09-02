// =====================================================================
// app.js — arranque, barra de pestañas y despacho de vistas.
// =====================================================================
import { h, icono, aviso } from './ui.js';
import { state, sesion, sincronizar, cargarCache, onChange, DEMO,
         enviarMagicLink, urlDeVuelta } from './db.js';
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
async function iniciar() {
  aplicarTema();
  const usuario = await sesion();
  if (!usuario) { pantallaLogin(); return; }

  cargarCache();
  render();
  tabs.hidden = false;
  onChange(render);
  alCambiarRuta(() => { window.scrollTo(0, 0); render(); });
  sincronizar().catch(e => console.warn('sync', e));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
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
 * pantalla: no hay nada que probar y no se sabe si es la app, el correo o
 * la conexion. Por eso el mensaje dice QUE paso y QUE hacer.
 */
function explicarError(error) {
  const m = String(error?.message || error || '').toLowerCase();
  if (/rate|too many|seconds|limit/.test(m))
    return { txt: 'Supabase corta los envíos si pedís varios seguidos. Esperá unos minutos.',
             detalle: error?.message };
  if (/redirect|not allowed|invalid.*url/.test(m))
    return { txt: `Falta permitir esta dirección en Supabase: ${urlDeVuelta()}`,
             detalle: error?.message };
  if (/signup|disabled|not allowed/.test(m))
    return { txt: 'Supabase no está aceptando altas nuevas con este correo.',
             detalle: error?.message };
  if (/fetch|network|failed/.test(m))
    return { txt: 'No pude hablar con el servidor. ¿Hay internet?', detalle: error?.message };
  return { txt: error?.message || 'No salió, y el servidor no dijo por qué.',
           detalle: error?.message };
}

function pantallaLogin() {
  tabs.hidden = true;
  let enviando = false;
  const email = h('input', { type: 'email', placeholder: 'tu@correo.com',
                             autocomplete: 'email', inputmode: 'email' });
  const detalle = h('div.small', { style: { marginTop: '14px', lineHeight: '1.5',
                                            textAlign: 'left' }, hidden: true });
  const boton = h('button.btn', { onclick: async () => {
    if (enviando || !email.value.includes('@')) { email.focus(); return; }
    enviando = true; boton.disabled = true; boton.textContent = 'Enviando…';
    detalle.hidden = true;
    let error = null;
    try { ({ error } = await enviarMagicLink(email.value.trim())); }
    catch (e) { error = e; }
    enviando = false; boton.disabled = false; boton.textContent = 'Entrar';

    if (!error) {
      aviso('Listo. Te mandé un link para entrar.');
      detalle.hidden = false;
      detalle.replaceChildren(
        h('div.aviso', { style: { display: 'block' } },
          h('div.tt', 'Revisá el correo'),
          h('div.ds', 'Abrí el link desde este mismo aparato. Si lo abrís en la computadora, ',
            'la sesión queda ahí y no acá.')));
      return;
    }
    const e = explicarError(error);
    aviso('No pude mandar el link');
    detalle.hidden = false;
    detalle.replaceChildren(
      h('div.aviso.amb', { style: { display: 'block' } },
        h('div.tt', 'No salió'),
        h('div.ds', e.txt),
        e.detalle && e.detalle !== e.txt
          ? h('div.ds', { style: { marginTop: '8px', fontFamily: 'ui-monospace,monospace',
                                   fontSize: '11.5px', opacity: '.8' } }, e.detalle) : null));
  } }, 'Entrar');

  app.replaceChildren(h('div', { style: { maxWidth: '340px', margin: '18vh auto 0', textAlign: 'center' } },
    h('svg', { width: 56, height: 56, viewBox: '0 0 100 100', 'aria-hidden': 'true',
               html: '<path style="fill:var(--tx)" d="M16 13.5A3.5 3.5 0 0 1 19.5 10h8A3.5 3.5 0 0 1 31 13.5v73a3.5 3.5 0 0 1-3.5 3.5h-8A3.5 3.5 0 0 1 16 86.5Z M22 10h24a18 18 0 0 1 0 36H22Z M31 35h15a7 7 0 0 0 0-14H31Z M22 54h46a18 18 0 0 1 0 36H22Z M31 79h37a7 7 0 0 0 0-14H31Z"/>' }),
    h('h1', { style: { fontSize: '32px', fontWeight: '800', letterSpacing: '-.05em', margin: '18px 0 8px' } }, 'BISHUSHA'),
    h('p.mut', { style: { fontSize: '14.5px', lineHeight: '1.45', marginBottom: '26px' } },
      'Poné tu correo y te mando un link para entrar. Sin contraseñas.'),
    h('div.f', h('label', 'Correo'), email),
    boton, detalle));
}

iniciar();
