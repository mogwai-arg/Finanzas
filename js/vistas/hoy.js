// =====================================================================
// vistas/hoy.js — la pantalla principal.
//
// Responde tres preguntas en orden de urgencia, que es como se usan:
//   1. ¿Cómo vengo este mes?
//   2. ¿Qué tengo que pagar y cuándo?
//   3. ¿Con qué me conviene pagar?
// No son tres pestañas: es un orden vertical.
// =====================================================================
import { h, frag, icono, iconoDe } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plataPartida, plata, cuandoVence, diasHasta, hoyISO, aFecha, nombreDe } from '../formato.js';
import { irA } from '../ruteo.js';

const per = () => hoyISO().slice(0, 7);

export function vistaHoy(root, { moneda = 'ARS' } = {}) {
  const hoy = new Date();
  const p = per();
  const res = F.resumenMes(state.transactions, p, moneda);

  root.append(
    h('div.flow',
      selectorMoneda(moneda),
      sinRevisar(),
      conexionCaida(),
      moneda === 'ARS' ? heroMes(res, hoy, p) : heroDolares(),
      loQueSeViene(hoy, moneda),
      presupuesto(res, p),
      antesDeComprar()
    )
  );
}

// ------------------------------------------------------------ moneda
function selectorMoneda(actual) {
  const btn = (v, txt) => h('button', {
    role: 'tab', 'aria-selected': String(actual === v),
    onclick: () => irA(v === 'ARS' ? '/hoy' : '/hoy/usd')
  }, txt);
  return h('div.seg', { role: 'tablist', 'aria-label': 'Moneda' },
    btn('ARS', 'Pesos'), btn('USD', 'Dólares'));
}

// ------------------------------------------------- lo que entro solo
function sinRevisar() {
  const n = state.transactions.filter(t => t.revisado === false).length;
  if (!n) return null;
  return h('button.aviso', {
    style: { width: '100%', textAlign: 'left', border: '0', cursor: 'pointer' },
    onclick: () => irA('/revisar')
  },
    h('div.av.bra', icono('campana', 17)),
    h('div.txt',
      h('div.tt', n === 1 ? '1 movimiento para revisar' : `${n} movimientos para revisar`),
      h('div.ds', 'Entraron solos. Confirmarlos toma menos de un minuto.')),
    h('span.chev', icono('chev', 16))
  );
}

/**
 * El permiso de Gmail se puede caer, y cuando se cae la mayoria de la gente
 * abandona la app en vez de reconectar. Por eso el aviso es un bloque de
 * primer nivel y no un renglon perdido en Ajustes.
 */
function conexionCaida() {
  const g = (state.integrations || []).find(i => i.proveedor === 'gmail');
  if (!g || (g.activo && !g.ultimo_error)) return null;
  const dias = g.ultima_sync ? diasHasta(g.ultima_sync.slice(0, 10)) : null;
  return h('div.aviso.amb',
    h('div.av.amb', icono('rayo', 17)),
    h('div.txt',
      h('div.tt', 'Se cortó la lectura de mails'),
      h('div.ds', dias != null
        ? `Puede haber consumos sin cargar desde hace ${Math.abs(dias)} días.`
        : 'Puede haber consumos sin cargar.'),
      h('button.btn', { onclick: () => irA('/ajustes') }, 'Reconectar'))
  );
}

// -------------------------------------------------------- hero del mes
function heroMes(res, hoy, p) {
  const tope = topeDelMes(p);
  const [y, m] = p.split('-').map(Number);
  const enElMes = new Date(y, m, 0).getDate();
  const diaActual = hoy.getDate();
  const pctGasto = tope > 0 ? Math.min(100, (res.gastos / tope) * 100) : 0;
  const pctRitmo = (diaActual / enElMes) * 100;
  const desvio = Math.round(pctGasto - pctRitmo);
  const quedan = Math.max(0, tope - res.gastos);
  const diasQuedan = Math.max(1, enElMes - diaActual);
  const porDia = quedan / diasQuedan;

  const { simbolo, numero } = plataPartida(Math.round(res.gastos), 'ARS');

  return h('div.grp.pad',
    h('div', { style: { display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', gap: '10px' } },
      h('div',
        h('div.cifra', h('em', simbolo), numero),
        h('div.small.mut', { style: { marginTop: '5px' } },
          tope > 0 ? `gastado de ${plata(tope)}` : 'gastado este mes')),
      // Los primeros dias del mes la comparacion con el ritmo no dice nada:
      // los gastos fijos caen todos juntos el 1 y el porcentaje se dispara.
      tope > 0 && diaActual >= 5 && h('span.pill', { class: `pill ${desvio > 3 ? 'amb' : 'pos'}` },
        icono(desvio > 3 ? 'sube' : 'check', 11),
        desvio > 3 ? `${desvio} pts` : 'al día')
    ),
    tope > 0 && h('div.track',
      h('b', { style: { width: pctGasto + '%' } }),
      h('i', { style: { left: Math.min(99, pctRitmo) + '%' } })),
    tope > 0 && h('div.legend',
      h('span', `${Math.round(pctGasto)} % gastado`),
      h('span', 'día ', h('b', String(diaActual)), ` de ${enElMes} · marca del ritmo`)),
    tope > 0 && h('div', {
      style: { marginTop: '13px', paddingTop: '13px', borderTop: '1px solid var(--line)',
               fontSize: '13.5px', color: 'var(--tx2)', lineHeight: '1.45' } },
      diaActual < 5
        ? frag('Recién arranca el mes. Tenés ',
            h('b', { style: { color: 'var(--tx)' } }, `${plata(Math.round(porDia))} por día`),
            ` hasta el ${enElMes}.`)
        : frag('Te quedan ',
            h('b', { style: { color: 'var(--tx)' } }, `${plata(Math.round(porDia))} por día`),
            ` para llegar al ${enElMes} sin pasarte.`)),
    res.movido > 0 && h('div', {
      style: { marginTop: '10px', fontSize: '12.5px', color: 'var(--tx3)' } },
      `${plata(Math.round(res.movido))} movidos entre tus cuentas — no cuentan como gasto.`)
  );
}

const topeDelMes = p => state.budgets.filter(b => b.periodo === p && b.moneda !== 'USD')
                                     .reduce((s, b) => s + Number(b.monto || 0), 0);

function heroDolares() {
  const cuentas = state.accounts.filter(a => a.moneda === 'USD' && a.activo !== false);
  const total = cuentas.reduce((s, a) => s + F.saldoDeCuenta(a, state.transactions, new Date(),
                                                             a.saldo_inicial || 0, a.saldo_al), 0);
  const ref = Number(state.settings?.usd_ref) || 0;
  const { simbolo, numero } = plataPartida(total, 'USD');
  return h('div.grp.pad',
    h('div.ghead', { style: { margin: '0 0 5px' } }, 'Tengo'),
    h('div.cifra', h('em', simbolo), numero),
    ref > 0 && h('div.small.mut', { style: { marginTop: '5px' } },
      `≈ ${plata(total * ref)} a ${plata(ref)} por dólar`),
    h('div', { style: { display: 'flex', gap: '7px', marginTop: '14px', flexWrap: 'wrap' } },
      cuentas.map(a => h('span.pill.mut', a.nombre)))
  );
}

// ---------------------------------------------------- lo que se viene
function loQueSeViene(hoy, moneda) {
  const items = [];

  // Tarjetas: lo que hay que pagar y cuando
  for (const t of state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false)) {
    const c = F.proximoCiclo(t, hoy);
    const total = F.totalTarjetaEnPeriodo(state.transactions, t,
                                          F.periodo(c.vence), moneda);
    if (!total) continue;
    items.push({ id: t.id, nombre: t.nombre, monto: total, vence: c.vence,
                 icono: 'tarjeta', nota: c.declarado ? null: 'estimado',
                 ir: `/tarjetas/${t.id}` });
  }

  // Gastos fijos sin pagar
  const p = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  for (const r of F.recurrentesDelMes(state.recurrings, state.recurring_payments, p, hoy)) {
    if (r.pagado || r.moneda !== moneda) continue;
    items.push({ id: r.id, nombre: r.nombre, monto: r.monto, vence: r.vence,
                 icono: iconoDe(r.nombre), ir: `/mes` });
  }

  if (!items.length) return null;
  items.sort((a, b) => a.vence - b.vence);

  return h('section',
    h('div.ghead', 'Lo que se viene',
      h('button', { onclick: () => irA('/mes') }, 'Ver todo')),
    h('div.grp', items.slice(0, 5).map(it => {
      const d = diasHasta(it.vence instanceof Date
        ? `${it.vence.getFullYear()}-${String(it.vence.getMonth() + 1).padStart(2, '0')}-${String(it.vence.getDate()).padStart(2, '0')}`
        : it.vence, hoy);
      const sev = d < 0 ? 'sev sev-neg' : d <= 3 ? 'sev sev-amb' : '';
      const iso = it.vence instanceof Date
        ? `${it.vence.getFullYear()}-${String(it.vence.getMonth() + 1).padStart(2, '0')}-${String(it.vence.getDate()).padStart(2, '0')}`
        : it.vence;
      return h(`button.li.${sev || 'li'}`.replace('.li.li', '.li'), {
        class: `li ${sev}`, onclick: () => irA(it.ir)
      },
        h('div', { class: `av ${d < 0 ? 'neg' : d <= 3 ? 'amb' : ''}` }, icono(it.icono, 17)),
        h('div.m', h('div.t', it.nombre),
          h('div.s', cuandoVence(iso, hoy) + (it.nota ? ` · ${it.nota}` : ''))),
        h('div.v', plata(it.monto, moneda)));
    }))
  );
}

// ------------------------------------------------------- presupuesto
function presupuesto(res, p) {
  const budgets = state.budgets.filter(b => b.periodo === p);
  if (!budgets.length) return null;
  const est = F.estadoPresupuesto(budgets, res, Number(state.settings?.alert_pct) || 80);

  return h('section',
    h('div.ghead', 'Presupuesto',
      h('button', { onclick: () => irA('/mes') }, 'Ajustar')),
    h('div.grp', est.map(b => {
      const nom = nombreDe('categories', b.category_id, 'Sin categoría');
      const excedido = b.gastado > b.tope;
      const dentro = Math.min(b.gastado, b.tope);
      const exceso = Math.max(0, b.gastado - b.tope);
      return h('div', { style: { padding: '13px 14px', position: 'relative' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between',
                            alignItems: 'baseline', gap: '10px' } },
          h('span', { style: { fontSize: '14.5px', fontWeight: '500', letterSpacing: '-.012em' } }, nom),
          h('span.small.mut', h('b', { style: { color: 'var(--tx)' } }, plata(b.gastado)),
            ` de ${plata(b.tope)}`)),
        // Avance en tinta, exceso en ambar. Nunca verde ni rojo: el tablero
        // en rojo hace que uno se autodefina como malo con la plata.
        h('div.mini',
          h('b', { class: b.pct >= 80 ? 'al' : '', style: { flex: String(Math.max(1, dentro)) } }),
          exceso > 0 && h('s', { style: { flex: String(exceso) } })),
        excedido && h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px',
                   color: 'var(--amb)', fontWeight: '600', marginTop: '7px' } },
          `${plata(exceso)} de más`, icono('chev', 13))
      );
    }))
  );
}

// --------------------------------------------------- antes de comprar
function antesDeComprar() {
  return h('section',
    h('div.ghead', 'Antes de comprar'),
    h('div.grp',
      h('button.li', { onclick: () => irA('/pago') },
        h('div.av.bra', icono('tarjeta', 17)),
        h('div.m', h('div.t', '¿Con qué pago?'),
          h('div.s', 'Compará financiación y reintegro')),
        h('span.chev', icono('chev', 15))),
      h('button.li', { onclick: () => irA('/donde') },
        h('div.av', icono('monedas', 17)),
        h('div.m', h('div.t', 'Dónde está la plata'),
          h('div.s', 'Saldo por cuenta, en pesos y en dólares')),
        h('span.chev', icono('chev', 15))))
  );
}
