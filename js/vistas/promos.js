// =====================================================================
// vistas/promos.js — promos del dia, ordenadas por cercania.
// La barra de tope consumido es lo que hace honesta la pantalla: una promo
// de "25 %" con el tope al 62 % ya no es del 25 %.
// =====================================================================
import { h, icono, iconoDe, aviso } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plata, hoyISO } from '../formato.js';
import { formPromo } from './formularios.js';
import { posicion, sucursalesCerca, distanciaTexto, mapsUrl } from '../geo.js';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function vistaPromos(root) {
  let cuando = 'hoy';
  const lista = h('div.flow', { style: { gap: '9px' } });
  const seg = h('div.seg', { role: 'tablist' },
    ...[['hoy', 'Hoy'], ['semana', 'La semana'], ['todas', 'Todas']].map(([id, txt]) =>
      h('button', { role: 'tab', 'aria-selected': String(id === cuando),
        onclick: e => {
          cuando = id;
          seg.querySelectorAll('button').forEach((b, i) =>
            b.setAttribute('aria-selected', String(['hoy', 'semana', 'todas'][i] === id)));
          pintar();
        } }, txt)));

  function pintar() {
    lista.replaceChildren();
    const hoy = new Date();
    let promos = state.promos.filter(p => p.activa !== false);
    if (cuando === 'hoy') promos = F.promosDelDia(promos, hoy);
    else if (cuando === 'semana') promos = promos.filter(p => !p.vigencia_hasta || p.vigencia_hasta >= hoyISO());

    if (!promos.length) {
      lista.append(h('div.vacio',
        h('div.ic', icono('pin', 24)),
        h('h3', cuando === 'hoy' ? 'Hoy no hay promos' : 'Todavía no cargaste promos'),
        h('p', cuando === 'hoy' ? 'Mirá "La semana" para ver qué se viene.'
                                : 'Cargá las que uses y la app te avisa cuándo aplican.'),
        h('button.btn.sec', { onclick: () => formPromo() }, 'Cargar una promo')));
      return;
    }
    for (const p of promos) lista.append(tarjeta(p, hoy));
  }

  function tarjeta(p, hoy) {
    const per = hoyISO().slice(0, 7);
    const uso = (state.promo_usos || []).find(u => u.promo_id === p.id && u.periodo === per);
    const usado = uso ? Number(uso.usado) : 0;
    const tope = Number(p.tope) || 0;
    const pct = tope > 0 ? Math.min(100, (usado / tope) * 100) : 0;
    const aplicaHoy = !p.dias?.length || p.dias.includes(hoy.getDay());
    const proximo = !aplicaHoy && p.dias?.length
      ? DIAS[p.dias.slice().sort((a, b) => ((a - hoy.getDay() + 7) % 7) - ((b - hoy.getDay() + 7) % 7))[0]]
      : null;

    return h('button.grp.pad', { style: { width: '100%', textAlign: 'left', border: '0',
                                          display: 'block', cursor: 'pointer',
                                          opacity: aplicaHoy ? '1' : '.62' },
                                 onclick: () => formPromo(p) },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '11px' } },
        h('div', { class: 'cifra' + (aplicaHoy ? ' pos' : ''), style: { fontSize: '22px' } },
          `${p.valor}%`),
        h('div', { style: { flex: '1', minWidth: '0' } },
          h('div', { style: { fontWeight: '600', fontSize: '15.5px', letterSpacing: '-.015em' } },
            p.titulo),
          h('div.small.mut', { style: { marginTop: '1px' } },
            [p.medio_pago, p.dias?.length ? p.dias.map(d => DIAS[d]).join(' y ') : 'todos los días']
              .filter(Boolean).join(' · '))),
        proximo && h('span.pill.mut', proximo)),
      tope > 0 && h('div', { style: { marginTop: '11px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between',
                            fontSize: '11.5px', color: 'var(--tx2)', marginBottom: '5px' } },
          h('span', 'Tope del mes'),
          h('span', h('b', { class: 'tabnum', style: { color: 'var(--tx)' } }, plata(usado)),
            ` de ${plata(tope)}`)),
        h('div.mini', h('b', { class: pct >= 60 ? 'al' : '', style: { flex: String(Math.max(1, usado)) } }),
          h('span', { style: { flex: String(Math.max(1, tope - usado)) } }))),
      tope > 0 && usado >= tope && h('div.small', { style: { color: 'var(--amb)', marginTop: '7px',
                                                             fontWeight: '600' } },
        'Tope agotado este mes'),
      cerca(p));
  }

  // --------------------------------------------------- cercania por GPS
  const cercania = h('div');
  let sucursales = new Map();
  const btnGps = h('button.btn.sec', { onclick: async () => {
    btnGps.disabled = true; btnGps.textContent = 'Buscando…';
    try {
      const centro = await posicion();
      const activas = state.promos.filter(p => p.activa !== false && p.osm_filtro);
      const res = await Promise.all(activas.map(p =>
        sucursalesCerca(p, centro).then(l => [p.id, l]).catch(() => [p.id, []])));
      sucursales = new Map(res);
      btnGps.textContent = 'Actualizar ubicación';
      pintar();
    } catch (e) {
      aviso(e && e.code === 1 ? 'Hace falta permiso de ubicación'
                              : 'No pude ubicarte. Probá de nuevo.');
      btnGps.textContent = 'Ver las más cercanas';
    }
    btnGps.disabled = false;
  } }, icono('pin', 17), 'Ver las más cercanas');
  cercania.append(btnGps);

  /** La sucursal mas cercana, si ya pedimos la ubicacion. */
  function cerca(p) {
    const l = sucursales.get(p.id);
    if (!l || !l.length) return null;
    const s0 = l[0];
    return h('a', { href: mapsUrl(s0), target: '_blank', rel: 'noopener',
                    style: { display: 'flex', alignItems: 'center', gap: '5px',
                             fontSize: '12.5px', color: 'var(--tx2)', marginTop: '9px' } },
      icono('pin', 13),
      h('b', { style: { color: 'var(--tx)', fontWeight: '600' } }, distanciaTexto(s0.metros)),
      s0.nombre ? ` · ${s0.nombre}` : '', h('span.chev', icono('chev', 12)));
  }

  pintar();
  root.append(h('div.flow', seg, cercania, lista,
    h('div.small.mut', { style: { padding: '0 4px', lineHeight: '1.45' } },
      'El tope consumido es lo que hace honesta la promo: "25 % de reintegro" con el tope lleno es 0 %.'),
    h('button.btn.sec', { onclick: () => formPromo() }, icono('mas', 17), 'Agregar promo')));
}
