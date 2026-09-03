// =====================================================================
// ui.js — helpers de DOM e iconos. Sin framework, sin dependencias.
// =====================================================================

/** h('div.card', {onclick}, hijos...) */
export function h(sel, props, ...kids) {
  if (props && (typeof props !== 'object' || Array.isArray(props) || props.nodeType)) {
    kids.unshift(props); props = null;
  }
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const k in (props || {})) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') {
      for (const pk in v) pk.startsWith('--') ? el.style.setProperty(pk, v[pk]) : (el.style[pk] = v[pk]);
    }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && !k.startsWith('aria') && k !== 'role') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  agregar(el, kids);
  return el;
}
function agregar(el, kids) {
  for (const k of kids.flat(4)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const frag = (...k) => { const f = document.createDocumentFragment(); agregar(f, k); return f; };
export const $ = s => document.querySelector(s);

// ------------------------------------------------------------- iconos
// Trazo de 1.85, extremos redondos, 24x24. Nada de emojis: cambian de
// dibujo segun el aparato y rompen el registro visual.
const TRAZOS = {
  casa:    'm3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  lista:   'M4 6h16M4 12h16M4 18h10',
  micro:   'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M19 11a7 7 0 0 1-14 0 M12 18v3M8.5 21h7',
  enviar:  'M4 12h14M13 6l6 6-6 6',
  chat:    'M21 12a8 8 0 0 1-8 8H8l-4 3v-4.5A8 8 0 0 1 12 4h1a8 8 0 0 1 8 8z',
  mas:     'M12 5v14M5 12h14',
  tarjeta: 'M2.5 5h19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM.5 9.8h23M4 15.2h3.4',
  pin:     'M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0zM12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
  campana: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  ojo:     'M2 12s3.6-6.4 10-6.4S22 12 22 12s-3.6 6.4-10 6.4S2 12 2 12ZM12 14.9a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8z',
  ojoNo:   'M9.6 5.9A9.8 9.8 0 0 1 12 5.6c6.4 0 10 6.4 10 6.4a17.6 17.6 0 0 1-3.3 4.1M6 7.1A17.4 17.4 0 0 0 2 12s3.6 6.4 10 6.4a9.9 9.9 0 0 0 3.4-.6M10 10a2.9 2.9 0 0 0 4 4M3 3l18 18',
  ajustes: 'M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zM12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4 7 7M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6',
  chev:    'm9 18 6-6-6-6',
  lapiz:   'M4 20.2h4.2L18.8 9.6a2.9 2.9 0 0 0-4.1-4.1L4 16.1v4.1zM13.6 6.6l3.9 3.9',
  tacho:   'M4 6.6h16M9.4 6.6V4.8a1.2 1.2 0 0 1 1.2-1.2h2.8a1.2 1.2 0 0 1 1.2 1.2v1.8M6.4 6.6l.9 13.1a1.2 1.2 0 0 0 1.2 1.1h7a1.2 1.2 0 0 0 1.2-1.1l.9-13.1M10 10.4v6.4M14 10.4v6.4',
  cerrar:  'M6 6l12 12M18 6 6 18',
  check:   'M20 6.4 9.2 17.2 4 12',
  buscar:  'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-3.5-3.5',
  filtro:  'M3 5h18M6 12h12M10 19h4',
  banco:   'M3 9.6 12 4l9 5.6M4.6 9.6v8.8M9.5 9.6v8.8M14.5 9.6v8.8M19.4 9.6v8.8M2.6 18.4h18.8M2.6 21h18.8',
  billete: 'M2.5 5.6h19a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2V7.6a2 2 0 0 1 2-2zM12 14.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z',
  monedas: 'M20.4 6.2c0 2-3.8 3.6-8.4 3.6S3.6 8.2 3.6 6.2 7.4 2.6 12 2.6s8.4 1.6 8.4 3.6zM3.6 6.2v11.6c0 2 3.8 3.6 8.4 3.6s8.4-1.6 8.4-3.6V6.2M3.6 11.8c0 2 3.8 3.6 8.4 3.6s8.4-1.6 8.4-3.6',
  celular: 'M6.6 2.5h10.8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM10.6 18.6h2.8',
  qr:      'M3.4 2.5h9.6v19H3.4zM7 18.6h2.4M16.6 8.6a4.8 4.8 0 0 1 0 6.8M19.6 5.9a8.8 8.8 0 0 1 0 12.2',
  carro:   'M2.6 3.2h2.3l2.4 11.3a1.9 1.9 0 0 0 1.9 1.5h8.6a1.9 1.9 0 0 0 1.8-1.4L21.2 7H6.1M10.6 20a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0zM19.4 20a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0z',
  nafta:   'M3.6 20.6h10.6M4.7 20.6V5.2a2 2 0 0 1 2-2h5.2a2 2 0 0 1 2 2v15.4M4.7 11.2h9.2M13.9 8.4h2.9a1.9 1.9 0 0 1 1.9 1.9v5.4a1.7 1.7 0 0 0 3.4 0V9.4l-2.2-2.7',
  comida:  'M6.2 2.6v6.8a2.6 2.6 0 0 0 5.2 0V2.6M8.8 12v9.4M17.4 2.6c-1.8 1-2.7 3.1-2.7 5.7s.9 4.2 2.7 4.7v8.4',
  pastilla:'M17.4 3.6a4.9 4.9 0 0 1 0 6.9l-6.9 6.9a4.9 4.9 0 0 1-6.9-6.9l6.9-6.9a4.9 4.9 0 0 1 6.9 0zM7.1 7.1l6.9 6.9',
  salud:   'M9.6 3.2h4.8v6.4h6.4v4.8h-6.4v6.4H9.6v-6.4H3.2V9.6h6.4z',
  colegio: 'M12 3.2 22 8l-10 4.8L2 8l10-4.8zM6.2 10.4V16c0 1.7 2.6 3 5.8 3s5.8-1.3 5.8-3v-5.6M22 8v5.4',
  casa2:   'M3.6 11.4V8.6a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v2.8M20.4 11.4a2 2 0 0 0-2 2v2.2H5.6v-2.2a2 2 0 1 0-4 0v4.6a1.5 1.5 0 0 0 1.5 1.5h17.8a1.5 1.5 0 0 0 1.5-1.5v-4.6a2 2 0 0 0-2-2z',
  play:    'M2.5 3.8h19a2 2 0 0 1 2 2v9.4a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2zM8.2 21.2h7.6M10.6 8.4l4.4 2.5-4.4 2.5z',
  nube:    'M17.4 19.2a4.6 4.6 0 0 0 .6-9.1 6.6 6.6 0 0 0-12.5 1.4 3.9 3.9 0 0 0 .8 7.7z',
  auto:    'M3.1 12.4 5 7.1a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 7.1l1.9 5.3M2.5 14.5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v3.5h-19zM6.9 15.2h.01M17.1 15.2h.01',
  sobre:   'M2.5 4.6h19a2 2 0 0 1 2 2v10.8a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2zM1.4 6.4l10.6 6 10.6-6',
  recibo:  'M5 2.6h14v18.8l-2.8-1.8-2.8 1.8-2.8-1.8-2.8 1.8L5 19.6zM8.6 7.6h6.8M8.6 12h6.8',
  rayo:    'M13.4 2.4 4 13.6h6.6L10.6 21.6 20 10.4h-6.6z',
  sube:    'M12 19V5m-6 6 6-6 6 6',
  tendencia:'M2.8 17.2 9 11l4 4 8.2-8.2M15.4 6.8h5.8v5.8',
  reloj:   'M21.2 12a9.2 9.2 0 1 1-18.4 0 9.2 9.2 0 0 1 18.4 0zM12 6.8V12l3.4 2',
  sync:    'M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.9-4.7M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.9 4.7M21 4v5h-5M3 20v-5h5',
  varios:  'M6 12a1.6 1.6 0 1 1-3.2 0A1.6 1.6 0 0 1 6 12zm7.6 0a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0zm7.6 0a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0z'
};

/**
 * El isotipo. Va aparte de `icono` porque es una silueta rellena, no un
 * trazo, y porque `h('svg')` no sirve: crea un elemento HTML llamado "svg"
 * y no se dibuja nada. Los SVG necesitan su espacio de nombres.
 */
export function marca(tam = 52, color = 'var(--tx)') {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('width', tam); s.setAttribute('height', tam);
  s.setAttribute('viewBox', '0 0 100 100');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', 'BISHUSHA');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('fill', color);
  p.setAttribute('d', 'M16 13.5A3.5 3.5 0 0 1 19.5 10h8A3.5 3.5 0 0 1 31 13.5v73a3.5 3.5 0 0 1-3.5 3.5h-8A3.5 3.5 0 0 1 16 86.5Z M22 10h24a18 18 0 0 1 0 36H22Z M31 35h15a7 7 0 0 0 0-14H31Z M22 54h46a18 18 0 0 1 0 36H22Z M31 79h37a7 7 0 0 0 0-14H31Z');
  s.append(p);
  return s;
}

export function icono(nombre, tam = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', tam); s.setAttribute('height', tam);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.85');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', TRAZOS[nombre] || TRAZOS.varios);
  s.append(p);
  return s;
}

/** Icono sugerido para una categoria o un comercio. */
export function iconoDe(texto = '') {
  const t = texto.toLowerCase();
  const mapa = [
    [/super|coto|carrefour|dia|jumbo|chango|vea/, 'carro'],
    [/nafta|combustible|ypf|shell|axion|puma/, 'nafta'],
    [/resto|gastronom|pedidosya|mcdonald|mostaza|pizz|kfc|burger|cafe|bar\b|delivery/, 'comida'],
    [/farmac|pastilla|remedio/, 'pastilla'],
    [/salud|osde|swiss|medic|prepaga|hospital/, 'salud'],
    [/colegio|escuela|educa|matricula|universidad/, 'colegio'],
    [/hogar|mueble|sodimac|easy|expensas|alquiler|fravega|frávega|garbarino|musimundo|electro/, 'casa2'],
    [/ropa|indumentaria|zapatilla|calzado|naked|zara|adidas|nike|vestir/, 'carro'],
    [/netflix|spotify|disney|prime|hbo|entreten|cine|juguete|suscrip|streaming/, 'play'],
    [/openai|vercel|github|aws|cloud|adobe|microsoft|google|apple/, 'nube'],
    [/uber|cabify|taxi|transporte|sube|peaje|nafta|estacionamiento/, 'auto'],
    [/sueldo|haberes|ingreso|cobro/, 'billete'],
    [/tarjeta|visa|master|amex/, 'tarjeta'],
    [/banco|galicia|nacion|caja/, 'banco'],
    [/mercado ?pago|personal ?pay|modo|billetera/, 'qr'],
    [/efectivo|sobre/, 'sobre'],
    [/luz|gas|agua|internet|telefon|servicio|edesur|metrogas|flow|aysa|edenor|camuzzi|telecom|fibertel|movistar|claro/, 'rayo']
  ];
  for (const [re, ic] of mapa) if (re.test(t)) return ic;
  return 'varios';
}

/**
 * El icono de una categoria: el que eligió la persona, o el que se adivina.
 *
 * Adivinar del nombre anda para "Supermercado" y falla para "Mascotas": lo
 * elegido gana siempre, y sin nada elegido no cambia lo que ya andaba.
 */
export const iconoDeCategoria = c =>
  (c && c.icono) || iconoDe((c && c.nombre) || '');

/** Los iconos entre los que se puede elegir, en orden de uso. */
export const ICONOS = ['carro', 'comida', 'nafta', 'auto', 'casa2', 'casa', 'rayo',
  'salud', 'pastilla', 'colegio', 'play', 'nube', 'celular', 'tarjeta', 'billete',
  'monedas', 'banco', 'qr', 'sobre', 'recibo', 'pin', 'reloj', 'lista'];

/**
 * Una grilla para elegir icono, con "solo" como primera opcion.
 *
 * `alElegir` recibe el nombre, o null si se deja en automatico.
 */
export function selectorDeIcono(valor, { alElegir } = {}) {
  let elegido = valor || null;
  const grilla = h('div.iconos');

  const pintar = () => {
    grilla.replaceChildren(
      h('button.ico-op', { type: 'button', 'aria-pressed': String(!elegido),
        title: 'Según el nombre',
        onclick: () => { elegido = null; pintar(); alElegir && alElegir(null); } },
        icono('varios', 19), h('span.small', 'solo')),
      ...ICONOS.map(n => h('button.ico-op', {
        type: 'button', 'aria-pressed': String(elegido === n), 'aria-label': n,
        onclick: () => { elegido = n; pintar(); alElegir && alElegir(n); }
      }, icono(n, 19))));
  };
  pintar();
  return grilla;
}

// -------------------------------------------------------------- hojas
export function hoja(titulo, contenido, { onClose } = {}) {
  const mask = h('div.mask', { onclick: e => { if (e.target === mask) cerrar(); } });
  const tirador = h('div.tirador');
  const cruz = h('button.cerrar-hoja', { type: 'button', 'aria-label': 'Cerrar',
                                         onclick: () => cerrar() }, icono('cerrar', 17));
  const caja = h('div.hoja', { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    tirador, titulo ? h('div.hoja-tope', h('h2', titulo), cruz) : cruz);
  mask.append(caja);
  arrastrarParaCerrar(caja, tirador, () => cerrar());

  const antes = document.activeElement;
  const cerrar = () => {
    mask.remove(); document.body.style.overflow = '';
    document.removeEventListener('keydown', tecla);
    antes && antes.focus && antes.focus();
    onClose && onClose();
  };
  const tecla = e => {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (e.key !== 'Tab') return;
    // El foco no puede escaparse de la hoja mientras esta abierta.
    const f = caja.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const [pri, ult] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
  };

  caja.append(typeof contenido === 'function' ? contenido(cerrar) : contenido);
  document.body.append(mask);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', tecla);
  const primero = caja.querySelector('input,select,textarea,button');
  if (primero && matchMedia('(min-width:600px)').matches) setTimeout(() => primero.focus(), 80);
  return cerrar;
}

/**
 * Bajar la hoja con el dedo para cerrarla, que es lo que uno intenta primero.
 * El gesto arranca en el tirador o en el encabezado, o en cualquier parte si el
 * contenido ya esta arriba de todo: asi no le roba el scroll a la lista.
 */
function arrastrarParaCerrar(caja, tirador, cerrar) {
  let y0 = null, dy = 0, t0 = 0;

  const puedeArrancar = destino =>
    tirador.contains(destino) || destino.closest('.hoja-tope,h2') || caja.scrollTop <= 0;

  caja.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || !puedeArrancar(e.target)) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    caja.style.transition = 'none';
  }, { passive: true });

  caja.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    // Para arriba no se estira: eso es scroll del contenido.
    if (dy <= 0) { if (caja.scrollTop <= 0) dy = 0; else { y0 = null; caja.style.transition = ''; return; } }
    if (dy > 0 && e.cancelable) e.preventDefault();
    caja.style.transform = `translateY(${dy}px)`;
    fondoDe(caja).style.opacity = String(Math.max(0, 1 - dy / 420));
  }, { passive: false });

  const soltar = () => {
    if (y0 == null) return;
    const rapido = dy / Math.max(1, Date.now() - t0) > 0.5;   // px por ms
    caja.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1)';
    fondoDe(caja).style.transition = 'opacity .22s linear';
    if (dy > caja.offsetHeight * 0.28 || (rapido && dy > 60)) {
      caja.style.transform = `translateY(${caja.offsetHeight}px)`;
      fondoDe(caja).style.opacity = '0';
      setTimeout(cerrar, 200);
    } else {
      caja.style.transform = '';
      fondoDe(caja).style.opacity = '';
    }
    y0 = null;
  };
  caja.addEventListener('touchend', soltar);
  caja.addEventListener('touchcancel', soltar);
}
const fondoDe = caja => caja.parentElement || caja;

export function aviso(msg, ms = 2800) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div.toast', { role: 'status', 'aria-live': 'polite' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function confirmar(msg, textoOk = 'Borrar', { peligro = true } = {}) {
  return new Promise(ok => {
    // La respuesta se registra ANTES de cerrar. Cerrar dispara onClose, que
    // responde que no: si el boton de aceptar cerraba primero, la promesa ya
    // habia quedado en `false` y el `ok(true)` de despues no hacia nada. Toda
    // confirmacion de la app decia que si y no pasaba nada.
    let respondido = false;
    const responder = v => { if (respondido) return; respondido = true; ok(v); };
    const cerrar = hoja('¿Seguro?', h('div',
      h('p.mut', { style: { margin: '-6px 0 20px', fontSize: '14.5px', lineHeight: '1.45' } }, msg),
      h('div.fila',
        h('button.btn.sec', { onclick: () => { responder(false); cerrar(); } }, 'Cancelar'),
        h(peligro ? 'button.btn.dg' : 'button.btn',
          { onclick: () => { responder(true); cerrar(); } }, textoOk))
    ), { onClose: () => responder(false) });
  });
}

// ------------------------------------------------------------- campos
/**
 * Elegir un dia del mes tocandolo, no escribiendolo.
 *
 * Un campo numerico deja escribir 509 —lo que sale de teclear '5/09'— y con
 * eso el ciclo de la tarjeta se calcula sobre una fecha que no existe. Una
 * grilla del 1 al 31 no tiene como equivocarse, y ademas se ve como un
 * almanaque, que es lo que uno espera cuando le piden un dia.
 */
export function selectorDeDia(valor, { titulo = 'Elegir día', hasta = 31, alElegir } = {}) {
  let dia = Number(valor) >= 1 && Number(valor) <= hasta ? Number(valor) : null;

  const boton = h('button.selector-dia', { type: 'button', onclick: () => abrir() });
  const pintar = () => {
    boton.replaceChildren(
      h('span', dia ? String(dia) : 'Elegir'),
      icono('reloj', 17));
    boton.classList.toggle('vacio', !dia);
  };
  pintar();

  function abrir() {
    const grilla = h('div.dias');
    for (let d = 1; d <= hasta; d++) {
      grilla.append(h('button.dia', {
        type: 'button',
        'aria-pressed': String(d === dia),
        onclick: () => { dia = d; pintar(); alElegir && alElegir(d); cerrar(); }
      }, String(d)));
    }
    const cerrar = hoja(titulo, h('div',
      grilla,
      dia ? h('button.btn.sec', { style: { marginTop: '16px' },
        onclick: () => { dia = null; pintar(); alElegir && alElegir(null); cerrar(); } },
        'Dejarlo sin día') : null));
  }

  // La misma interfaz que un input, para que el resto del codigo no cambie.
  Object.defineProperty(boton, 'value', {
    get: () => (dia == null ? '' : String(dia)),
    set: v => { dia = Number(v) >= 1 && Number(v) <= hasta ? Number(v) : null; pintar(); }
  });
  return boton;
}

export const campo = (label, control) => h('div.f', h('label', label), control);
export const input = (props = {}) => h('input', props);
export function select(opciones, props = {}) {
  const s = h('select', props);
  for (const o of opciones) {
    const op = h('option', { value: o.value }, o.label);
    if (String(o.value) === String(props.value)) op.selected = true;
    s.append(op);
  }
  return s;
}

/**
 * Deslizar una fila para editarla o borrarla.
 *
 * En el telefono el gesto es el atajo: abrir la ficha para cambiar un monto,
 * o para borrar algo que se cargo dos veces, cuesta tres toques. Deslizar
 * cuesta uno.
 *
 * Reglas del gesto, que son las que lo hacen no molestar:
 *   · Solo toma el control si el dedo va mas horizontal que vertical. Si no,
 *     es scroll de la lista y hay que devolverselo.
 *   · Se suelta antes del umbral y vuelve solo, sin hacer nada.
 *   · Borrar pregunta. Deslizar sin querer y perder un movimiento seria peor
 *     que no tener el gesto.
 */
export function deslizable(fila, { alEditar, alBorrar } = {}) {
  const fondo = h('div.desliz-fondo',
    h('span.desliz-acc.edit', icono('lapiz', 17), 'Editar'),
    h('span.desliz-acc.borrar', 'Borrar', icono('tacho', 17)));
  const caja = h('div.desliz', fondo, fila);

  const UMBRAL = 78;
  let x0 = null, y0 = null, dx = 0, mando = false;

  const soltar = () => {
    fila.style.transition = 'transform .18s ease';
    fila.style.transform = '';
    fondo.classList.remove('vis', 'a-borrar', 'a-editar');
  };

  caja.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mando = false;
    fila.style.transition = 'none';
  }, { passive: true });

  caja.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const t = e.touches[0];
    const ax = t.clientX - x0, ay = t.clientY - y0;
    // Hasta que no se sabe hacia donde va el dedo, no se le roba el scroll.
    if (!mando) {
      if (Math.abs(ax) < 10 || Math.abs(ax) < Math.abs(ay)) return;
      mando = true;
      fondo.classList.add('vis');
    }
    dx = Math.max(-140, Math.min(140, ax));
    if (!alEditar && dx > 0) dx = 0;
    if (!alBorrar && dx < 0) dx = 0;
    if (e.cancelable) e.preventDefault();
    fila.style.transform = `translateX(${dx}px)`;
    fondo.classList.toggle('a-editar', dx > UMBRAL);
    fondo.classList.toggle('a-borrar', dx < -UMBRAL);
  }, { passive: false });

  const fin = async () => {
    if (x0 == null) return;
    const paso = dx;
    x0 = null;
    soltar();
    if (!mando) return;
    // Despues de un gesto horizontal el navegador manda igual el click de la
    // fila: sin taparlo, deslizar para editar abria la ficha dos veces.
    caja.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); },
                          { capture: true, once: true });
    setTimeout(() => {
      if (paso > UMBRAL && alEditar) alEditar();
      else if (paso < -UMBRAL && alBorrar) alBorrar();
    }, 0);
  };
  caja.addEventListener('touchend', fin);
  caja.addEventListener('touchcancel', () => { x0 = null; soltar(); });

  return caja;
}

export const esqueleto = (ancho = '60%', alto = 12) =>
  h('div.sk', { style: { width: ancho, height: alto + 'px' } });


/**
 * Una sección que se pliega, y se acuerda de cómo la dejaste.
 *
 * Números es la pantalla más larga de la app y tiene que serlo: es adonde uno
 * va a mirar. Pero nueve secciones abiertas son casi tres pantallas de
 * scroll, y lo que está abajo deja de existir.
 *
 * Dos reglas que hacen que plegar no sea esconder:
 *
 * - El encabezado plegado tiene que decir el número. "Presupuesto ›" no dice
 *   nada; "Presupuesto · 2 pasados de tope" evita tener que abrirlo.
 * - Lo que necesita atención se abre igual. Si algo se pasó del tope, plegarlo
 *   sería justo el caso en que la app deja de servir. `atencion` gana sobre
 *   lo que uno haya guardado.
 */
export function plegable(titulo, contenido, { resumen, abierto = false, atencion = false,
                                              recordar, accion } = {}) {
  const clave = recordar ? `bishusha.plegado.${recordar}` : null;
  const guardado = () => { try { return clave && localStorage.getItem(clave); }
                           catch { return null; } };
  // Con algo que mirar se abre igual, aunque estuviera plegada: esconder un
  // tope pasado es lo contrario de para qué está la pantalla.
  let abierta = atencion || (guardado() ? guardado() === '1' : abierto);

  const cuerpo = h('div');
  const chev = icono('chev', 15);
  chev.style.transition = 'transform .18s';

  // El título no se parte y el resumen se corta con puntos suspensivos: con
  // el botón de acción al lado, un encabezado de dos renglones se lee como
  // dos secciones distintas.
  chev.style.flexShrink = '0';
  const boton = h('button', {
    'aria-expanded': String(abierta),
    style: { display: 'flex', alignItems: 'center', gap: '5px', flex: '1',
             minWidth: '0', textAlign: 'left',
             color: 'var(--tx2)', letterSpacing: '.06em', textTransform: 'uppercase',
             fontSize: 'inherit' }
  }, h('span', { style: { flexShrink: '0' } }, titulo),
     h('span.small', { style: { letterSpacing: '0', textTransform: 'none',
                                fontWeight: '500', color: 'var(--tx3)',
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap' } }, resumen || ''), chev);

  const pintar = () => {
    cuerpo.hidden = !abierta;
    chev.style.transform = abierta ? 'rotate(90deg)' : 'none';
    boton.setAttribute('aria-expanded', String(abierta));
  };
  boton.onclick = () => {
    abierta = !abierta;
    if (clave) { try { localStorage.setItem(clave, abierta ? '1' : '0'); } catch { /* privado */ } }
    pintar();
  };

  cuerpo.append(...[contenido].flat().filter(Boolean));
  pintar();

  return h('section',
    h('div.ghead', boton, accion || null),
    cuerpo);
}
