// =====================================================================
// vistas/gastos.js — la lista, agrupada por dia, con buscador.
// El reintegro se muestra DEBAJO del monto, no restado: se quiere ver lo
// que se pago y lo que van a devolver, separados.
// =====================================================================
import { h, icono, iconoDe } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plata, fechaRelativa, nombreDe, buscar, tituloTx, dondeTx } from '../formato.js';
import { formMovimiento } from './form-movimiento.js';

export function vistaGastos(root) {
  let texto = '';
  let moneda = 'ARS';
  const lista = h('div.flow', { style: { gap: '16px' } });

  const buscador = h('div.search',
    icono('buscar', 17),
    h('input', { type: 'search', placeholder: 'Buscar comercio, monto o nota',
                 'aria-label': 'Buscar', oninput: e => { texto = e.target.value; pintar(); } }));

  const seg = h('div.seg', { role: 'tablist', style: { marginTop: '-6px' } },
    ...['ARS', 'USD'].map(m => h('button', {
      role: 'tab', 'aria-selected': String(m === moneda),
      onclick: () => { moneda = m; seg.querySelectorAll('button').forEach(b =>
        b.setAttribute('aria-selected', String(b.textContent === (m === 'ARS' ? 'Pesos' : 'Dólares')))); pintar(); }
    }, m === 'ARS' ? 'Pesos' : 'Dólares')));

  function pintar() {
    const q = texto.trim().toLowerCase();
    const txs = F.movimientosEnMoneda(state.transactions, moneda)
      .filter(({ tx: t }) => !q || [t.descripcion, t.comercio, t.notas, String(t.monto),
                          nombreDe('categories', t.category_id, '')]
                          .join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.tx.fecha < b.tx.fecha ? 1 : -1);

    lista.replaceChildren();
    if (!txs.length) {
      lista.append(h('div.vacio',
        h('div.ic', icono(q ? 'buscar' : 'lista', 24)),
        h('h3', q ? 'Nada con eso' : 'Todavía no hay movimientos'),
        h('p', q ? 'Probá con el nombre del comercio o con el monto.'
                 : 'Los consumos con tarjeta entran solos. A mano va el efectivo.'),
        !q && h('button.btn.sec', { onclick: () => formMovimiento() }, 'Cargar uno')));
      return;
    }

    const porDia = new Map();
    for (const it of txs) {
      if (!porDia.has(it.tx.fecha)) porDia.set(it.tx.fecha, []);
      porDia.get(it.tx.fecha).push(it);
    }
    for (const [fecha, items] of porDia) {
      const neto = items.reduce((s, { tx: t, monto }) =>
        s + (t.tipo === 'ingreso' ? monto : t.tipo === 'transferencia' ? 0 : -monto), 0);
      lista.append(h('section',
        h('div.ghead', fechaRelativa(fecha),
          h('span', { class: 'tabnum small', style: { fontWeight: '500', letterSpacing: '0',
                                                      textTransform: 'none',
                                                      color: neto > 0 ? 'var(--pos)' : 'var(--tx3)' } },
            plata(neto, moneda, { signo: neto > 0 }))),
        h('div.grp', items.map(it => fila(it, moneda)))));
    }
  }

  function fila({ tx: t, entrante, monto }, moneda) {
    const cat = nombreDe('categories', t.category_id, t.tipo === 'transferencia' ? 'Movimiento' : 'Sin categoría');
    const cuenta = buscar('accounts', t.account_id);
    const destino = buscar('accounts', t.destino_account_id);
    const esIngreso = t.tipo === 'ingreso';
    const esTransf = t.tipo === 'transferencia';
    // La pata que entra de una compra de dólares se lee al revés: no salió de
    // esta cuenta, llegó a ella.
    const donde = entrante
      ? `de ${cuenta ? cuenta.nombre : 'otra cuenta'}${destino ? ` · ${destino.nombre}` : ''}`
      : null;
    return h('button.li', { onclick: () => formMovimiento(t) },
      h('div', { class: 'av' + (esIngreso ? ' pos' : '') },
        icono(esTransf ? 'sync' : iconoDe(t.comercio || t.descripcion || cat), 17)),
      h('div.m',
        h('div.t', tituloTx(t)),
        donde ? h('div.s', donde) :
        h('div.s', esTransf && destino ? `a ${destino.nombre}` : [dondeTx(t), cat].filter(Boolean).join(' · '),
          cuenta ? ` · ${cuenta.nombre}${cuenta.ultimos4 ? ' ·' + cuenta.ultimos4 : ''}` : '',
          t.cuotas > 1 ? ` · ${t.cuotas} cuotas` : '')),
      h('div', { class: 'v' + (esIngreso ? ' pos' : '') },
        esTransf ? plata(monto, moneda, { signo: entrante }) 
                 : plata(esIngreso ? monto : -monto, moneda, { signo: esIngreso }),
        t.reintegro > 0 && h('small', { style: { color: 'var(--pos)' } },
          `−${plata(t.reintegro, moneda)} reintegro`),
        t.revisado === false && h('small', { style: { color: 'var(--brand)' } }, 'sin revisar')));
  }

  pintar();
  root.append(h('div.flow', buscador, seg, lista));
}
