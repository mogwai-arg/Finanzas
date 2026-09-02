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
import * as S from '../sueldo.js';
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
      moneda === 'ARS' ? proximoSueldo() : null,
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
    // Primero lo que hay que pagar: un resumen ya cerrado que vence en dias
    // importa mas que el ciclo que recien empezo a acumular.
    const c = F.resumenAPagar(t, hoy) || F.proximoCiclo(t, hoy);
    const total = F.totalTarjetaEnPeriodo(state.transactions, t, F.periodo(c.vence), moneda);
    if (!total) continue;
    items.push({ id: t.id, nombre: t.nombre, monto: total, vence: c.vence,
                 icono: 'tarjeta', nota: c.declarado ? null : 'estimado',
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
        h('div.v', plata(moneda === 'USD' ? it.monto : Math.round(it.monto), moneda)));
    }))
  );
}


// ------------------------------------------------------- proximo sueldo
/**
 * Lo que se cobra la proxima vez, en banco y en sobre, con la razon del
 * cambio. Un sueldo puede BAJAR aun con aumento —si el mes anterior tenia
 * vacaciones o un bono que no se repite—, y sin explicacion esa caida
 * parece un error de la app.
 */
function proximoSueldo() {
  const recibos = (state.recibos || []).map(r => ({
    periodo: r.periodo, basico: Number(r.basico) || 0,
    remunerativo: Number(r.remunerativo) || 0,
    noRemunerativo: Number(r.no_remunerativo ?? r.noRemunerativo) || 0,
    deducciones: Number(r.deducciones) || 0, neto: Number(r.neto) || 0,
    sobre: Number(r.sobre) || 0, conceptos: r.conceptos || []
  }));
  if (recibos.length < 2) return null;

  const ult = recibos[recibos.length - 1];
  const cobro = S.proximoCobro(recibos, {
    diaCobro: Number(state.settings?.dia_cobro) || 1,
    sobre: ult.sobre || Number(state.settings?.sobre_estimado) || 0,
    sobreDesde: ult.periodo,
    // El acuerdo sale de los que estan cargados en Sueldo. Sin ninguno que
    // cubra el periodo, se proyecta con el ritmo aprendido y se avisa.
    acuerdo: S.acuerdoVigente(state.paritarias, S.sumarMeses(ult.periodo, 1)),
    sumas: S.sumasDeclaradas(state.sumas_nr)
  });
  if (!cobro) return null;

  const baja = cobro.diferencia < 0;
  const razones = cobro.porque.slice(0, 2);

  return h('section',
    h('div.ghead', 'El mes que viene',
      h('span.pill.mut', { style: { textTransform: 'none', letterSpacing: '0' } },
        cobro.conAcuerdo ? 'con paritaria firmada' : 'estimado')),
    h('button.grp.pad', { style: { width: '100%', textAlign: 'left', border: '0',
                                   cursor: 'pointer', display: 'block' },
                          onclick: () => irA('/sueldo') },
      h('div', { style: { display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', gap: '10px' } },
        h('div',
          h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                     style: { fontSize: '30px' } }, plata(Math.round(cobro.total))),
          h('div.small.mut', { style: { marginTop: '4px' } },
            `entrarían el ${diaMes(cobro.fecha)}`)),
        h('span', { class: `pill ${baja ? 'amb' : 'pos'}` },
          h('span', { style: { display: 'grid', transform: baja ? 'rotate(180deg)' : 'none' } },
            icono('sube', 11)),
          `${cobro.porcentaje > 0 ? '+' : ''}${cobro.porcentaje.toFixed(1)} %`)),

      // Banco y sobre, separados: el sobre es casi la mitad de lo que entra.
      h('div', { style: { display: 'flex', gap: '3px', marginTop: '14px', height: '7px' } },
        h('div', { style: { flex: String(Math.max(1, cobro.banco)), background: 'var(--tx)',
                            borderRadius: '99px 0 0 99px' } }),
        cobro.sobre > 0 && h('div', { style: { flex: String(cobro.sobre), background: 'var(--tx3)',
                                               borderRadius: '0 99px 99px 0' } })),
      h('div.legend', { style: { marginTop: '9px' } },
        h('span', 'banco ', h('b', { class: state.ocultarMontos ? 'oculto' : '' },
          plata(Math.round(cobro.banco)))),
        cobro.sobre > 0 && h('span', 'sobre ', h('b', { class: state.ocultarMontos ? 'oculto' : '' },
          plata(Math.round(cobro.sobre))))),

      razones.length ? h('div', {
        style: { marginTop: '13px', paddingTop: '13px', borderTop: '1px solid var(--line)',
                 fontSize: '13px', color: 'var(--tx2)', lineHeight: '1.45' } },
        baja ? 'Da menos que este mes porque ' : 'Cambia porque ',
        razones.map((r, i) => frag(i > 0 ? ', y ' : '',
          r.conMonto ? `${r.texto} (${plata(Math.round(r.monto))})` : r.texto)), '.') : null,

      h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px', marginTop: '9px',
                          fontSize: '12.5px', color: cobro.conAcuerdo ? 'var(--tx3)' : 'var(--amb)' } },
        h('span', cobro.conAcuerdo
          ? 'Cálculo estimativo, con el aumento ya acordado.'
          : 'Sin paritaria cargada para ese mes: cargala para afinar el número.'),
        icono('chev', 13)))
  );
}

const diaMes = iso => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
};

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
          h('span.small.mut', h('b', { style: { color: 'var(--tx)' } }, plata(Math.round(b.gastado))),
            ` de ${plata(b.tope)}`)),
        // Avance en tinta, exceso en ambar. Nunca verde ni rojo: el tablero
        // en rojo hace que uno se autodefina como malo con la plata.
        h('div.mini',
          dentro > 0 && h('b', { class: b.pct >= 80 ? 'al' : '',
                                 style: { flex: String(dentro) } }),
          exceso > 0 && h('s', { style: { flex: String(exceso) } }),
          // sin este tramo vacio el unico hijo ocupa todo y la barra se ve llena
          b.restante > 0 && h('span', { style: { flex: String(b.restante) } })),
        excedido && h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px',
                   color: 'var(--amb)', fontWeight: '600', marginTop: '7px' } },
          `${plata(Math.round(exceso))} de más`, icono('chev', 13))
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
