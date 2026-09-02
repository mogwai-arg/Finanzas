// =====================================================================
// vistas/tarjetas.js — ciclo, cuotas comprometidas y limite.
// El grafico muestra lo que YA debes, no lo que gastaste: las barras bajan
// solas a medida que se terminan las cuotas.
// =====================================================================
import { h, icono } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, diasHasta, fechaISO, mesCorto, periodoLargo, buscar } from '../formato.js';
import { irA } from '../ruteo.js';
import { formCuenta } from './formularios.js';

const isoDe = d => fechaISO(d);

export function vistaTarjetas(root) {
  const hoy = new Date();
  const tarjetas = state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false);
  if (!tarjetas.length) {
    root.append(h('div.vacio',
      h('div.ic', icono('tarjeta', 24)),
      h('h3', 'Todavía no hay tarjetas'),
      h('p', 'Cargá una con su cierre y su vencimiento para ver el cronograma de cuotas.'),
      h('button.btn.sec', { onclick: () => formCuenta() }, 'Cargar una tarjeta')));
    return;
  }
  root.append(h('div.flow',
    ...tarjetas.map(t => plastico(t, hoy, true)),
    deudaTotal(tarjetas, hoy),
    h('button.btn.sec', { onclick: () => formCuenta() }, icono('mas', 17), 'Agregar tarjeta')));
}

export function vistaTarjeta(root, { id }) {
  const t = buscar('accounts', id);
  if (!t) { irA('/tarjetas'); return; }
  const hoy = new Date();
  root.append(h('div.flow',
    plastico(t, hoy, false),
    limite(t, hoy),
    cuotasVivas(t, hoy),
    proximosResumenes(t, hoy),
    h('button.btn.sec', { onclick: () => formCuenta(t) }, icono('ajustes', 17), 'Editar tarjeta')));
}

// ---------------------------------------------------------------- cc
function plastico(t, hoy, linkear) {
  // Lo primero es lo que hay que pagar. Un resumen ya cerrado que vence en
  // tres dias importa mucho mas que el que recien empezo a acumular.
  const aPagar = F.resumenAPagar(t, hoy);
  const c = F.proximoCiclo(t, hoy);
  const foco = aPagar || c;
  const total = F.totalTarjetaEnPeriodo(state.transactions, t, F.periodo(foco.vence), t.moneda || 'ARS');
  const { simbolo, numero } = plataPartida(
    (t.moneda || 'ARS') === 'USD' ? total : Math.round(total), t.moneda || 'ARS');
  const dv = diasHasta(isoDe(foco.vence), hoy);
  const dc = diasHasta(isoDe(c.cierre), hoy);
  const fmt = d => `${d.getDate()}/${d.getMonth() + 1}`;

  const cc = h('div.cc', {
    style: { '--c1': t.color || '#2A2F52', '--c2': '#12141F',
             cursor: linkear ? 'pointer' : 'default' },
    onclick: linkear ? () => irA(`/tarjetas/${t.id}`) : null },
    h('div.rowt',
      h('div', h('div.nm', t.nombre),
        t.ultimos4 && h('div.n4', '•••• ' + t.ultimos4)),
      t.marca && h('span.marca', t.marca)),
    h('div.amtl', { style: { marginTop: '14px' } },
      aPagar ? (dv <= 0 ? 'Venció' : dv <= 3 ? `A pagar en ${dv} d` : 'A pagar') : 'Resumen en curso'),
    h('div', { class: 'amt' + (state.ocultarMontos ? ' oculto' : '') }, `${simbolo} ${numero}`),
    h('div.foot',
      h('div', h('span', aPagar ? 'Vence' : 'Cierra'),
        h('b', aPagar ? `${fmt(foco.vence)} · en ${dv} d` : `${fmt(c.cierre)} · en ${dc} d`)),
      h('div', h('span', aPagar ? 'Próximo cierre' : 'Vence'),
        h('b', aPagar ? `${fmt(c.cierre)} · en ${dc} d` : `${fmt(c.vence)} · en ${dv} d`)),
      !foco.declarado && h('div', h('span', 'estimado'))));
  return cc;
}

// ------------------------------------------------------------ limite
function limite(t, hoy) {
  if (!t.limite) return null;
  const l = F.limiteDeTarjeta(t, state.transactions, hoy, t.moneda || 'ARS');
  return h('section',
    h('div.ghead', 'Límite'),
    h('div.grp.pad',
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        h('div',
          h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                     style: { fontSize: '26px' } }, plata(Math.round(l.disponible), t.moneda)),
          h('div.small.mut', { style: { marginTop: '2px' } }, 'disponible')),
        h('span', { class: `pill ${l.usado >= 80 ? 'amb' : 'mut'}` }, `${l.usado} % usado`)),
      h('div.mini', { style: { marginTop: '12px' } },
        h('b', { class: l.usado >= 80 ? 'al' : '', style: { flex: String(Math.max(1, l.consumido)) } }),
        h('span', { style: { flex: String(Math.max(1, l.disponible)) } })),
      h('div.small.mut', { style: { marginTop: '9px', lineHeight: '1.45' } },
        `Consumido ${plata(l.consumido, t.moneda)} de ${plata(l.limite, t.moneda)}. `
        + 'Incluye las cuotas que todavía no vencieron.')));
}

// ------------------------------------------------------- cuotas vivas
function cuotasVivas(t, hoy) {
  const vivas = state.transactions
    .filter(tx => tx.account_id === t.id && tx.tipo === 'gasto' && (tx.cuotas || 1) > 1)
    .map(tx => {
      const cron = F.cronograma(tx, t, hoy);
      const pend = cron.filter(c => c.pendiente);
      const actual = cron.length - pend.length + 1;
      return { tx, cron, pend, actual: Math.min(actual, cron.length) };
    })
    .filter(x => x.pend.length);

  if (!vivas.length) return null;
  return h('section',
    h('div.ghead', 'En cuotas ahora'),
    h('div.grp', vivas.map(({ tx, cron, actual }) => h('div.li',
      h('div.av', icono('tarjeta', 17)),
      h('div.m',
        h('div.t', tx.comercio || tx.descripcion),
        h('div.s', `cuota ${actual} de ${tx.cuotas}`,
          actual === tx.cuotas ? ' · última' : '')),
      h('div.v', plata(tx.monto / tx.cuotas, tx.moneda),
        h('small', `de ${plata(tx.monto, tx.moneda)}`))))));
}

// --------------------------------------------------- proximos resumenes
function proximosResumenes(t, hoy) {
  const deuda = F.deudaFutura(state.transactions, [t], t.moneda || 'ARS', hoy, 7);
  if (!deuda.length) return null;
  const max = Math.max(...deuda.map(d => d.monto));
  const total = deuda.reduce((s, d) => s + d.monto, 0);

  return h('section',
    h('div.ghead', 'Lo que ya está comprometido'),
    h('div.grp.pad',
      h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                 style: { fontSize: '26px' } }, plata(Math.round(total), t.moneda)),
      h('div.small.mut', { style: { marginTop: '2px' } },
        `en ${deuda.length} resúmenes, hasta ${periodoLargo(deuda[deuda.length - 1].periodo)}`),
      h('div', { style: { display: 'flex', gap: '4px', alignItems: 'flex-end',
                          height: '56px', marginTop: '16px' } },
        deuda.map((d, i) => h('div', {
          title: `${periodoLargo(d.periodo)}: ${plata(d.monto, t.moneda)}`,
          style: { flex: '1', height: Math.max(6, (d.monto / max) * 100) + '%',
                   borderRadius: '4px 4px 0 0',
                   background: i === 0 ? 'var(--tx)' : i < 3 ? 'var(--tx2)' : 'var(--tx3)' } }))),
      h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px', fontSize: '10.5px',
                          color: 'var(--tx3)', textAlign: 'center' } },
        deuda.map(d => h('span', { style: { flex: '1' } }, mesCorto(d.periodo))))));
}

// -------------------------------------------------------- deuda total
function deudaTotal(tarjetas, hoy) {
  const deuda = F.deudaFutura(state.transactions, tarjetas, 'ARS', hoy, 12);
  if (!deuda.length) return null;
  const total = deuda.reduce((s, d) => s + d.monto, 0);
  const ingreso = ingresoMensual();
  const pct = ingreso > 0 ? Math.round((deuda[0].monto / ingreso) * 100) : null;
  const max = Math.max(...deuda.map(d => d.monto));

  return h('section',
    h('div.ghead', 'Cuotas ya comprometidas'),
    h('div.grp.pad',
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' } },
        h('div',
          h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                     style: { fontSize: '26px' } }, plata(Math.round(deuda[0].monto))),
          h('div.small.mut', { style: { marginTop: '2px' } },
            `el mes que viene · ${plata(Math.round(total))} en total`)),
        pct != null && h('span', { class: `pill ${pct >= 30 ? 'amb' : 'mut'}` },
          `${pct} % de lo que entra`)),
      h('div', { style: { display: 'flex', gap: '4px', alignItems: 'flex-end',
                          height: '56px', marginTop: '16px' } },
        deuda.map((d, i) => h('div', {
          title: `${periodoLargo(d.periodo)}: ${plata(d.monto)}`,
          style: { flex: '1', height: Math.max(5, (d.monto / max) * 100) + '%',
                   borderRadius: '4px 4px 0 0',
                   background: i === 0 ? 'var(--tx)' : i < 3 ? 'var(--tx2)' : 'var(--tx3)' } }))),
      h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px', fontSize: '10.5px',
                          color: 'var(--tx3)', textAlign: 'center' } },
        deuda.map(d => h('span', { style: { flex: '1' } }, mesCorto(d.periodo))))));
}

function ingresoMensual() {
  const r = (state.recibos || []).slice().sort((a, b) => a.periodo < b.periodo ? 1 : -1)[0];
  if (!r) return 0;
  return Number(r.neto || 0) + Number(r.sobre || 0);
}
