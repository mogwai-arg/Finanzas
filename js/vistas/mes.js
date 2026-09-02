// =====================================================================
// vistas/mes.js — gastos fijos y presupuesto del mes.
// =====================================================================
import { h, icono, iconoDe, hoja, aviso } from '../ui.js';
import { state, guardar } from '../db.js';
import * as F from '../finance.js';
import { plata, cuandoVence, nombreDe, fechaISO, hoyISO } from '../formato.js';
import { irA } from '../ruteo.js';
import { formRecurrente, formPresupuesto } from './formularios.js';

export function vistaMes(root) {
  const hoy = new Date();
  const p = hoyISO().slice(0, 7);
  const rec = F.recurrentesDelMes(state.recurrings, state.recurring_payments, p, hoy);
  const res = F.resumenMes(state.transactions, p, 'ARS');
  const budgets = state.budgets.filter(b => b.periodo === p);
  const faltan = rec.filter(r => !r.pagado);
  const tarjetas = resumenesDelMes(hoy);
  const esteMes = tarjetas.filter(t => F.periodo(t.vence) === p);
  const total = faltan.reduce((s, r) => s + r.monto, 0) +
                esteMes.reduce((s, t) => s + t.monto, 0);

  root.append(h('div.flow',
    (faltan.length || esteMes.length) ? h('div.grp.pad',
      h('div.ghead', { style: { margin: '0' } }, 'Falta pagar'),
      h('div', { class: 'cifra', style: { fontSize: '30px', marginTop: '5px' } }, plata(Math.round(total))),
      h('div.small.mut', { style: { marginTop: '4px' } },
        [esteMes.length ? `${esteMes.length} ${esteMes.length === 1 ? 'resumen' : 'resúmenes'}` : null,
         rec.length ? `${faltan.length} de ${rec.length} gastos fijos` : null]
          .filter(Boolean).join(' · '))) : null,

    // Los resúmenes son casi siempre el número más grande del mes: van
    // primero. Antes esta pantalla solo mostraba los gastos fijos, así que
    // el "Ver todo" de Hoy llevaba a una lista donde faltaba lo principal.
    tarjetas.length ? h('section',
      h('div.ghead', 'Tarjetas'),
      h('div.grp', tarjetas.map(t => h('button.li', { onclick: () => irA(`/tarjetas/${t.id}`) },
        h('div.av', icono('tarjeta', 17)),
        h('div.m', h('div.t', t.nombre),
          h('div.s', cuandoVence(fechaISO(t.vence), hoy) + (t.declarado ? '' : ' · estimado'))),
        h('div.v', plata(Math.round(t.monto), 'ARS')))))) : null,

    h('section',
      h('div.ghead', 'Gastos fijos',
        h('button', { onclick: () => formRecurrente() }, 'Agregar')),
      rec.length
        ? h('div.grp', rec.map(r => filaRecurrente(r, p, hoy)))
        : h('div.vacio', { style: { padding: '32px 24px' } },
            h('div.ic', icono('reloj', 24)),
            h('h3', 'Sin gastos fijos cargados'),
            h('p', 'El colegio, la prepaga, la luz. Cargalos una vez y la app te avisa cada mes.'),
            h('button.btn.sec', { onclick: () => formRecurrente() }, 'Cargar el primero'))),

    h('section',
      h('div.ghead', 'Presupuesto',
        h('button', { onclick: () => formPresupuesto(p) }, budgets.length ? 'Ajustar' : 'Definir')),
      budgets.length
        ? h('div.grp', F.estadoPresupuesto(budgets, res, Number(state.settings?.alert_pct) || 80)
            .map(b => filaPresupuesto(b)))
        : h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.5' } },
            'Sin topes cargados no hay con qué comparar el gasto del mes. ',
            'Empezá por tres categorías, no por diez.')))
  ));
}

/** Lo que hay que pagar de cada tarjeta, ordenado por vencimiento. */
function resumenesDelMes(hoy) {
  const out = [];
  for (const t of state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false)) {
    if (!F.tieneCiclo(t)) continue;      // sin cierre, la fecha seria inventada
    const c = F.resumenAPagar(t, hoy) || F.proximoCiclo(t, hoy);
    const monto = F.totalTarjetaEnPeriodo(state.transactions, t, F.periodo(c.vence), 'ARS');
    if (!monto) continue;
    out.push({ id: t.id, nombre: t.nombre, monto, vence: c.vence, declarado: c.declarado });
  }
  return out.sort((a, b) => a.vence - b.vence);
}

function filaRecurrente(r, periodo, hoy) {
  const vencido = r.vencido;
  const iso = fechaISO(r.vence);
  return h('button.li', {
    class: `li ${r.pagado ? '' : vencido ? 'sev sev-neg' : r.diasRestantes <= 3 ? 'sev sev-amb' : ''}`,
    onclick: () => togglePago(r, periodo),
    oncontextmenu: e => { e.preventDefault(); formRecurrente(state.recurrings.find(x => x.id === r.id)); }
  },
    h('div', { class: 'av' + (r.pagado ? ' pos' : vencido ? ' neg' : '') },
      icono(r.pagado ? 'check' : iconoDe(r.nombre), 17)),
    h('div.m',
      h('div.t', { style: r.pagado ? { color: 'var(--tx2)' } : {} }, r.nombre),
      h('div.s', r.pagado ? 'pagado' : cuandoVence(iso, hoy) + (r.variable ? ' · monto variable' : ''))),
    h('div', { class: 'v' + (r.pagado ? ' mut' : '') }, plata(r.monto, r.moneda)));
}

async function togglePago(r, periodo) {
  if (r.pagado) {
    await guardar('recurring_payments', { ...r.pago, pagado_at: null });
    aviso(`${r.nombre} vuelve a estar pendiente`);
    return;
  }
  if (r.variable) { formPagoVariable(r, periodo); return; }
  await guardar('recurring_payments', {
    ...(r.pago || {}), recurring_id: r.id, periodo,
    monto: r.monto, pagado_at: new Date().toISOString()
  });
  aviso(`${r.nombre} pagado`);
}

function formPagoVariable(r, periodo) {
  const campo = h('input', { type: 'text', inputmode: 'decimal',
                             value: String(r.monto || ''), 'aria-label': 'Monto pagado' });
  const cerrar = hoja(`¿Cuánto pagaste de ${r.nombre}?`, h('div',
    h('div.f', h('label', 'Monto'), campo),
    h('button.btn', { onclick: async () => {
      const monto = Number(String(campo.value).replace(/\./g, '').replace(',', '.')) || 0;
      await guardar('recurring_payments', {
        ...(r.pago || {}), recurring_id: r.id, periodo, monto,
        pagado_at: new Date().toISOString() });
      cerrar(); aviso(`${r.nombre} pagado`);
    } }, 'Marcar pagado')));
}

function filaPresupuesto(b) {
  const nom = nombreDe('categories', b.category_id, 'Sin categoría');
  const dentro = Math.min(b.gastado, b.tope);
  const exceso = Math.max(0, b.gastado - b.tope);
  return h('div', { style: { padding: '13px 14px', position: 'relative' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', gap: '10px' } },
      h('span', { style: { fontSize: '14.5px', fontWeight: '500' } }, nom),
      h('span.small.mut', h('b', { style: { color: 'var(--tx)' } }, plata(Math.round(b.gastado))),
        ` de ${plata(b.tope)}`)),
    h('div.mini',
      h('b', { class: b.pct >= 80 ? 'al' : '', style: { flex: String(Math.max(1, dentro)) } }),
      exceso > 0 && h('s', { style: { flex: String(exceso) } })),
    exceso > 0 && h('div', {
      style: { fontSize: '12.5px', color: 'var(--amb)', fontWeight: '600', marginTop: '7px' } },
      `${plata(Math.round(exceso))} de más`),
    exceso === 0 && b.restante > 0 && h('div.small.mut', { style: { marginTop: '7px' } },
      `quedan ${plata(Math.round(b.restante))}`));
}
