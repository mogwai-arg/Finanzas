// =====================================================================
// vistas/mes.js — gastos fijos y presupuesto del mes.
// =====================================================================
import { h, icono, iconoDe, hoja, aviso } from '../ui.js';
import { state, guardar } from '../db.js';
import * as F from '../finance.js';
import { plata, cuandoVence, nombreDe, fechaISO, hoyISO, aNumero as num } from '../formato.js';
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
    ...aumentos(),

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
      h('div.s', apoyo(r, iso, hoy))),
    h('div', { class: 'v' + (r.pagado ? ' mut' : '') }, plata(r.monto, r.moneda),
      // Lo que vale, cuando lo que se paga no es lo que vale.
      !r.pagado && r.saldo ? h('small', `vale ${plata(r.valor, r.moneda)}`) : null));
}

/** El renglon chico: cuando vence, y como viene el saldo arrastrado. */
function apoyo(r, iso, hoy) {
  const s = r.pagado ? r.saldoDespues : r.saldo;
  const arrastre = !s ? null
    : s > 0 ? `${plata(s, r.moneda)} a favor`
            : `debés ${plata(Math.abs(s), r.moneda)}`;
  const base = r.pagado ? `pagaste ${plata(r.monto, r.moneda)}`
                        : cuandoVence(iso, hoy) + (r.variable ? ' · variable' : '');
  return [base, arrastre].filter(Boolean).join(' · ');
}

async function togglePago(r, periodo) {
  if (r.pagado) {
    await guardar('recurring_payments', { ...r.pago, pagado_at: null });
    aviso(`${r.nombre} vuelve a estar pendiente`);
    return;
  }
  formPago(r, periodo);
}

/**
 * Marcar pagado diciendo cuanto se pago de verdad.
 *
 * El alquiler vale 850 dolares pero se pagan 900 para no romper billetes: lo
 * que vale no cambia, los 50 quedan a favor del mes que viene. Por eso el
 * monto siempre se puede editar, no solo en los gastos marcados como
 * variables.
 */
function formPago(r, periodo) {
  const campo = h('input', { type: 'text', inputmode: 'decimal',
                             value: String(r.sugerido || r.valor || ''), 'aria-label': 'Monto pagado' });
  const nuevoSaldo = h('div.small.mut', { style: { marginTop: '-10px', lineHeight: '1.45' } });

  const recalcular = () => {
    const pagado = num(campo.value);
    const queda = Math.round((r.saldo + pagado - r.valor) * 100) / 100;
    nuevoSaldo.replaceChildren(
      `Vale ${plata(r.valor, r.moneda)}.`,
      r.saldo ? ` Venías con ${plata(Math.abs(r.saldo), r.moneda)} ${r.saldo > 0 ? 'a favor' : 'en contra'}.` : '',
      !queda ? ' Queda saldado.'
        : queda > 0 ? ` Te quedan ${plata(queda, r.moneda)} a favor para el mes que viene.`
                    : ` Quedás debiendo ${plata(Math.abs(queda), r.moneda)}.`);
  };
  campo.addEventListener('input', recalcular);
  recalcular();

  const cerrar = hoja(`¿Cuánto pagaste de ${r.nombre}?`, h('div',
    h('div.f', h('label', 'Monto'), campo),
    nuevoSaldo,
    h('button.btn', { style: { marginTop: '16px' }, onclick: async () => {
      const monto = num(campo.value);
      if (!monto) { campo.focus(); aviso('Falta el monto'); return; }
      await guardar('recurring_payments', {
        ...(r.pago || {}), recurring_id: r.id, periodo, monto,
        pagado_at: new Date().toISOString() });
      const queda = Math.round((r.saldo + monto - r.valor) * 100) / 100;
      cerrar();
      aviso(queda ? `${r.nombre} pagado · ${plata(Math.abs(queda), r.moneda)} ${queda > 0 ? 'a favor' : 'en contra'}`
                  : `${r.nombre} pagado`);
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

/**
 * Los aumentos que la app leyó del correo, esperando tu visto bueno.
 *
 * No se aplican solos a propósito: un monto de gasto fijo mal cambiado se
 * arrastra todos los meses y es de los errores más difíciles de notar.
 */
function aumentos() {
  return (state.notificaciones || [])
    .filter(n => n.tipo === 'aumento' && !n.leida && n.datos?.monto)
    .map(n => {
      const r = state.recurrings.find(x => x.id === n.ref_id);
      if (!r) return null;
      const nuevo = Number(n.datos.monto);
      const antes = Number(n.datos.anterior ?? r.monto_estimado) || 0;
      const subio = antes ? Math.round(((nuevo - antes) / antes) * 100) : 0;

      return h('div.aviso.amb',
        h('div.av.amb', icono('sube', 17)),
        h('div.txt',
          h('div.tt', `${r.nombre} aumentó`),
          h('div.ds',
            `Un correo dice ${plata(nuevo, r.moneda)}`,
            n.datos.desde ? ` desde ${n.datos.desde}` : '', '. ',
            `Tenés cargado ${plata(antes, r.moneda)}`,
            subio ? ` · ${subio > 0 ? '+' : ''}${subio} %` : '', '.'),
          n.datos.asunto ? h('div.small.mut', { style: { marginTop: '6px' } },
            '“', String(n.datos.asunto).slice(0, 80), '”') : null,
          h('div.fila', { style: { marginTop: '12px' } },
            h('button.btn.sec', { onclick: async () => {
              await guardar('notificaciones', { ...n, leida: true });
              aviso('Listo, no lo vuelvo a proponer');
            } }, 'Dejalo como está'),
            h('button.btn', { onclick: async () => {
              await guardar('recurrings', { ...r, monto_estimado: nuevo });
              await guardar('notificaciones', { ...n, leida: true });
              aviso(`${r.nombre} actualizado`);
            } }, 'Actualizar'))));
    })
    .filter(Boolean);
}
