// =====================================================================
// vistas/mes.js — gastos fijos y presupuesto del mes.
// =====================================================================
import { h, icono, iconoDe, hoja, aviso } from '../ui.js';
import { state, guardar } from '../db.js';
import * as F from '../finance.js';
import { plata, cuandoVence, nombreDe, fechaISO, hoyISO } from '../formato.js';

export function vistaMes(root) {
  const hoy = new Date();
  const p = hoyISO().slice(0, 7);
  const rec = F.recurrentesDelMes(state.recurrings, state.recurring_payments, p, hoy);
  const res = F.resumenMes(state.transactions, p, 'ARS');
  const budgets = state.budgets.filter(b => b.periodo === p);
  const faltan = rec.filter(r => !r.pagado);
  const total = faltan.reduce((s, r) => s + r.monto, 0);

  root.append(h('div.flow',
    faltan.length ? h('div.grp.pad',
      h('div.ghead', { style: { margin: '0' } }, 'Falta pagar'),
      h('div', { class: 'cifra', style: { fontSize: '30px', marginTop: '5px' } }, plata(Math.round(total))),
      h('div.small.mut', { style: { marginTop: '4px' } },
        `${faltan.length} de ${rec.length} gastos fijos`)) : null,

    h('section',
      h('div.ghead', 'Gastos fijos'),
      rec.length
        ? h('div.grp', rec.map(r => filaRecurrente(r, p, hoy)))
        : h('div.vacio', { style: { padding: '32px 24px' } },
            h('div.ic', icono('reloj', 24)),
            h('h3', 'Sin gastos fijos cargados'),
            h('p', 'El colegio, la prepaga, la luz. Cargalos una vez y la app te avisa cada mes.'))),

    budgets.length ? h('section',
      h('div.ghead', 'Presupuesto'),
      h('div.grp', F.estadoPresupuesto(budgets, res, Number(state.settings?.alert_pct) || 80)
        .map(b => filaPresupuesto(b)))) : null
  ));
}

function filaRecurrente(r, periodo, hoy) {
  const vencido = r.vencido;
  const iso = fechaISO(r.vence);
  return h('button.li', {
    class: `li ${r.pagado ? '' : vencido ? 'sev sev-neg' : r.diasRestantes <= 3 ? 'sev sev-amb' : ''}`,
    onclick: () => togglePago(r, periodo)
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
      h('span.small.mut', h('b', { style: { color: 'var(--tx)' } }, plata(b.gastado)),
        ` de ${plata(b.tope)}`)),
    h('div.mini',
      h('b', { class: b.pct >= 80 ? 'al' : '', style: { flex: String(Math.max(1, dentro)) } }),
      exceso > 0 && h('s', { style: { flex: String(exceso) } })),
    exceso > 0 && h('div', {
      style: { fontSize: '12.5px', color: 'var(--amb)', fontWeight: '600', marginTop: '7px' } },
      `${plata(exceso)} de más`),
    exceso === 0 && b.restante > 0 && h('div.small.mut', { style: { marginTop: '7px' } },
      `quedan ${plata(b.restante)}`));
}
