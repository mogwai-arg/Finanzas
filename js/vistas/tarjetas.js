// =====================================================================
// vistas/tarjetas.js — ciclo, cuotas comprometidas y limite.
// El grafico muestra lo que YA debes, no lo que gastaste: las barras bajan
// solas a medida que se terminan las cuotas.
// =====================================================================
import { h, icono, iconoDe } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, diasHasta, fechaISO, mesCorto, periodoLargo, buscar,
         fechaRelativa } from '../formato.js';
import { irA } from '../ruteo.js';
import { formCuenta } from './formularios.js';
import { formImportarResumen } from './importar.js';
import { formMovimiento } from './form-movimiento.js';

const isoDe = d => fechaISO(d);

export function vistaTarjetas(root) {
  const hoy = new Date();
  const tarjetas = state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false);
  if (!tarjetas.length) {
    root.append(h('div.vacio',
      h('div.ic', icono('tarjeta', 24)),
      h('h3', 'Todavía no hay tarjetas'),
      h('p', 'Cargá una con su cierre y su vencimiento para ver el cronograma de cuotas.'),
      h('button.btn.sec', { onclick: () => formCuenta() }, 'Cargar una tarjeta'),
      h('button.btn.sec', { style: { marginTop: '10px' }, onclick: () => formImportarResumen() },
        'o importar un resumen')));
    return;
  }
  root.append(h('div.flow',
    ...tarjetas.map(t => plastico(t, hoy, true)),
    deudaTotal(tarjetas, hoy),
    h('button.btn.sec', { onclick: () => formCuenta() }, icono('mas', 17), 'Agregar tarjeta'),
    h('button.btn.sec', { onclick: () => formImportarResumen() }, icono('recibo', 17), 'Importar un resumen')));
}

export function vistaTarjeta(root, { id }) {
  const t = buscar('accounts', id);
  if (!t) { irA('/tarjetas'); return; }
  const hoy = new Date();
  root.append(h('div.flow',
    plastico(t, hoy, false),
    faltaElCierre(t),
    limite(t, hoy),
    consumosDelCiclo(t, hoy),
    cuotasVivas(t, hoy),
    proximosResumenes(t, hoy),
    h('button.btn.sec', { onclick: () => formCuenta(t) }, icono('ajustes', 17), 'Editar tarjeta'),
    h('button.btn.sec', { onclick: () => formImportarResumen() }, icono('recibo', 17), 'Importar un resumen')));
}

// ---------------------------------------------------------------- cc
function plastico(t, hoy, linkear) {
  // Lo primero es lo que hay que pagar. Un resumen ya cerrado que vence en
  // tres dias importa mucho mas que el que recien empezo a acumular.
  const aPagar = F.resumenAPagar(t, hoy);
  const c = F.proximoCiclo(t, hoy);
  const foco = aPagar || c;
  // Sin cierre cargado no hay resumen que mostrar: en vez de un cero que
  // parece un dato, se muestra todo lo que hay y se pide la fecha que falta.
  const sinCiclo = !F.tieneCiclo(t);
  const total = sinCiclo
    ? todoLoQueDebe(t)
    : F.totalTarjetaEnPeriodo(state.transactions, t, F.periodo(foco.vence), t.moneda || 'ARS');
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
      sinCiclo ? 'En consumos'
        : aPagar ? (dv <= 0 ? 'Venció' : dv <= 3 ? `A pagar en ${dv} d` : 'A pagar')
        : 'Resumen en curso'),
    h('div', { class: 'amt' + (state.ocultarMontos ? ' oculto' : '') }, `${simbolo} ${numero}`),
    sinCiclo
      ? h('div.foot', h('div', h('span', 'Falta el cierre'),
          h('b', 'sin él no sé cuándo se paga')))
      : h('div.foot',
          h('div', h('span', aPagar ? 'Vence' : 'Cierra'),
            h('b', aPagar ? `${fmt(foco.vence)} · en ${dv} d` : `${fmt(c.cierre)} · en ${dc} d`)),
          h('div', h('span', aPagar ? 'Próximo cierre' : 'Vence'),
            h('b', aPagar ? `${fmt(c.cierre)} · en ${dc} d` : `${fmt(c.vence)} · en ${dv} d`)),
          !foco.declarado && h('div', h('span', 'estimado'))));
  return cc;
}

/** Todo lo pendiente de una tarjeta, sin repartir por resumen. */
function todoLoQueDebe(t) {
  let total = 0;
  for (const tx of state.transactions) {
    if (tx.account_id !== t.id || tx.tipo !== 'gasto') continue;
    if ((tx.moneda || 'ARS') !== (t.moneda || 'ARS')) continue;
    total += Number(tx.monto) || 0;
  }
  return total;
}

/** Sin cierre no se puede armar el resumen: se pide la fecha que falta. */
function faltaElCierre(t) {
  if (F.tieneCiclo(t)) return null;
  return h('div.aviso.amb',
    h('div.av.amb', icono('rayo', 17)),
    h('div.txt',
      h('div.tt', 'Falta el cierre de esta tarjeta'),
      h('div.ds', 'Sin la fecha de cierre no sé a qué resumen va cada compra ni cuándo ' +
        'se paga. Cargá el día de cierre y el de vencimiento, o pegá un resumen y las ' +
        'saco de ahí.'),
      h('button.btn', { onclick: () => formCuenta(t) }, 'Cargar el cierre')));
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

/**
 * Los consumos del resumen que se esta mirando.
 *
 * Sin esto una tarjeta en cero no se puede explicar: puede ser que no haya
 * consumos, o que se hayan cargado en la cuenta del mismo banco en vez de en
 * la tarjeta. Viendo la lista, el error salta.
 */
function consumosDelCiclo(t, hoy) {
  const c = F.resumenAPagar(t, hoy) || F.proximoCiclo(t, hoy);
  const per = F.periodo(c.vence);
  const moneda = t.moneda || 'ARS';
  const sinCiclo = !F.tieneCiclo(t);

  const filas = [];
  for (const tx of state.transactions) {
    if (tx.account_id !== t.id || tx.tipo !== 'gasto') continue;
    for (const cu of F.cronograma(tx, t, hoy)) {
      if (!sinCiclo && cu.periodoVenc !== per) continue;
      filas.push({ tx, monto: cu.monto, nro: cu.nro, total: cu.total });
    }
  }
  filas.sort((a, b) => (a.tx.fecha < b.tx.fecha ? 1 : -1));

  const titulo = sinCiclo ? 'Consumos'
    : F.resumenAPagar(t, hoy) ? 'Lo que se paga' : 'Lo que va del resumen';
  if (!filas.length) {
    return h('section',
      h('div.ghead', titulo),
      h('div.grp.pad',
        h('div.small.mut', { style: { lineHeight: '1.5' } },
          'Todavía no hay consumos en este resumen. Si cargaste alguno y no aparece acá, ',
          'fijate que lo hayas puesto en la tarjeta y no en la cuenta del mismo banco: ',
          'en el formulario dicen el tipo al lado del nombre.')));
  }
  return h('section',
    h('div.ghead', titulo, h('span.mut', `${filas.length}`)),
    h('div.grp', filas.slice(0, 12).map(f => h('button.li', {
      onclick: () => formMovimiento(state.transactions.find(x => x.id === f.tx.id))
    },
      h('div.av', icono(iconoDe(f.tx.comercio || f.tx.descripcion), 17)),
      h('div.m',
        h('div.t', f.tx.comercio || f.tx.descripcion),
        h('div.s', fechaRelativa(f.tx.fecha, hoy) +
          (f.total > 1 ? ` · cuota ${f.nro} de ${f.total}` : ''))),
      h('div.v', plata(moneda === 'USD' ? f.monto : Math.round(f.monto), moneda)))),
      filas.length > 12 ? h('div.li', h('div.m', h('div.s.mut',
        `y ${filas.length - 12} más`))) : null));
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
