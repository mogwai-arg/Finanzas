// =====================================================================
// ui.js — helpers de DOM. Sin framework, sin dependencias.
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
      for (const pk in v) {
        if (pk.startsWith('--')) el.style.setProperty(pk, v[pk]);
        else el.style[pk] = v[pk];
      }
    }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(4)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const frag = (...k) => { const f = document.createDocumentFragment(); add(f, k); return f; };
export const $ = s => document.querySelector(s);

// ------------------------------------------------------------------ sheet
export function sheet(titulo, contenido, { onClose } = {}) {
  const mask = h('div.mask', { onclick: e => { if (e.target === mask) cerrar(); } });
  const cont = h('div.sheet', h('h3', titulo));
  mask.append(cont);
  const cerrar = () => { mask.remove(); document.body.style.overflow = ''; onClose && onClose(); };
  cont.append(typeof contenido === 'function' ? contenido(cerrar) : contenido);
  document.body.append(mask);
  document.body.style.overflow = 'hidden';
  const f = cont.querySelector('input,select,textarea');
  if (f && window.matchMedia('(min-width:641px)').matches) setTimeout(() => f.focus(), 60);
  return cerrar;
}

export function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = h('div.toast', msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function confirmar(msg, textoOk = 'Borrar') {
  return new Promise(ok => {
    const cerrar = sheet('Confirmar', h('div',
      h('p.mut', { style: { marginTop: '-6px' } }, msg),
      h('div.fila', { style: { marginTop: '18px' } },
        h('button.btn.sec', { onclick: () => { cerrar(); ok(false); } }, 'Cancelar'),
        h('button.btn.dg', { onclick: () => { cerrar(); ok(true); } }, textoOk))
    ));
  });
}

// ------------------------------------------------------------------ campos
export function campo(label, input) { return h('div.f', h('label', label), input); }

export function input(props = {}) { return h('input', props); }

export function select(opciones, props = {}) {
  const s = h('select', props);
  for (const o of opciones) {
    const op = h('option', { value: o.value }, o.label);
    if (String(o.value) === String(props.value)) op.selected = true;
    s.append(op);
  }
  return s;
}

export const fechaHoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function icono(nombre, tam = 18) {
  const paths = {
    mas: 'M12 5v14M5 12h14',
    check: 'M20 6L9 17l-5-5',
    reloj: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    pin: 'M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 1118 0zM12 12a2 2 0 100-4 2 2 0 000 4z',
    campana: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
    tarjeta: 'M3 10h18M5 6h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z',
    sync: 'M21 12a9 9 0 01-9 9 9 9 0 01-7.9-4.7M3 12a9 9 0 019-9 9 9 0 017.9 4.7M21 4v5h-5M3 20v-5h5'
  };
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', tam); s.setAttribute('height', tam);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[nombre] || paths.mas);
  s.append(p);
  return s;
}
