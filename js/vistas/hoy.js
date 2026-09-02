// =====================================================================
// vistas/hoy.js — la pantalla principal.
//
// Responde tres preguntas en orden de urgencia, que es como se usan:
//   1. ¿Cómo vengo este mes?
//   2. ¿Qué tengo que pagar y cuándo?
//   3. ¿Con qué me conviene pagar?
// No son tres pestañas: es un orden vertical.
// =====================================================================
import { h, frag, icono, iconoDe, hoja, campo, select, aviso } from '../ui.js';
import { state, guardar } from '../db.js';
import * as F from '../finance.js';
import * as S from '../sueldo.js';
import { plataPartida, plata, cuandoVence, diasHasta, hoyISO, aFecha, nombreDe,
         aNumero, etiquetaCuenta } from '../formato.js';
import { irA } from '../ruteo.js';
import { bishu, queDiceBishu } from '../bishu.js';

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
      moneda === 'ARS' ? promosMarcadas(hoy) : null,
      moneda === 'ARS' ? proximoSueldo() : null,
      presupuesto(res, p),
      moneda === 'ARS' ? tiraBishu(hoy) : null,
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

/**
 * En dolares interesan las dos cosas, y antes solo se veia una.
 *
 * El alquiler se paga en dolares: gastar en dolares es tan real como gastar
 * en pesos, y la pantalla mostraba unicamente el saldo. Ahora arriba va lo
 * mismo que en pesos —lo gastado en el mes— y abajo lo que queda, que en
 * dolares importa mas que en pesos porque es ahorro y no circulante.
 */
function heroDolares() {
  const res = F.resumenMes(state.transactions, per(), 'USD');
  const cuentas = state.accounts.filter(a => a.moneda === 'USD' && a.activo !== false);
  const total = cuentas.reduce((s, a) => s + F.saldoDeCuenta(a, state.transactions, new Date(),
                                                             a.saldo_inicial || 0, a.saldo_al), 0);
  const ref = Number(state.settings?.usd_ref) || 0;
  const { simbolo, numero } = plataPartida(res.gastos, 'USD');

  return h('div.grp.pad',
    h('div.cifra', h('em', simbolo), numero),
    h('div.small.mut', { style: { marginTop: '5px' } },
      res.ingresos > 0 ? `gastados este mes · entraron ${plata(res.ingresos, 'USD')}`
                       : 'gastados este mes'),

    h('div', { style: { marginTop: '13px', paddingTop: '13px',
                        borderTop: '1px solid var(--line)' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between',
                          alignItems: 'baseline', gap: '10px' } },
        h('span.small.mut', 'Tenés'),
        h('span', { style: { fontWeight: '600', fontSize: '17px' }, class: 'tabnum' },
          plata(total, 'USD'))),
      ref > 0 && h('div.small.mut', { style: { marginTop: '3px', textAlign: 'right' } },
        `≈ ${plata(total * ref)} a ${plata(ref)} por dólar`),
      h('div', { style: { display: 'flex', gap: '7px', marginTop: '11px', flexWrap: 'wrap' } },
        cuentas.map(a => h('span.pill.mut', a.nombre)))),

    res.movido > 0 && h('div', {
      style: { marginTop: '10px', fontSize: '12.5px', color: 'var(--tx3)' } },
      `${plata(res.movido, 'USD')} movidos entre tus cuentas — no cuentan como gasto.`)
  );
}

// ---------------------------------------------------- lo que se viene
function loQueSeViene(hoy, moneda) {
  const items = [];

  // Tarjetas: lo que hay que pagar y cuando
  for (const t of state.accounts.filter(a => a.tipo === 'credito' && a.activo !== false)) {
    // Primero lo que hay que pagar: un resumen ya cerrado que vence en dias
    // importa mas que el ciclo que recien empezo a acumular.
    // Sin cierre cargado, la fecha de vencimiento seria inventada: no entra
    // en una lista que ordena justamente por cuando hay que pagar.
    if (!F.tieneCiclo(t)) continue;
    const c = F.resumenAPagar(t, hoy) || F.proximoCiclo(t, hoy);
    const total = F.totalTarjetaEnPeriodo(state.transactions, t, F.periodo(c.vence), moneda);
    if (!total) continue;
    // Si ya se pagó algo de este resumen, lo que se viene es el resto.
    const falta = F.faltaPagarDeResumen(state.transactions, t, c, moneda);
    if (!falta) continue;
    const pagado = total - falta;
    items.push({ id: t.id, nombre: t.nombre, monto: falta, vence: c.vence,
                 icono: 'tarjeta',
                 nota: pagado > 0 ? `pagaste ${plata(Math.round(pagado), moneda)}`
                                  : (c.declarado ? null : 'estimado'),
                 tarjeta: t, ciclo: c,
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
      return h('div.li', { class: `li ${sev}` },
        h('button', { style: { display: 'flex', alignItems: 'center', gap: '12px',
                               flex: '1', minWidth: '0', background: 'none', border: '0',
                               padding: '0', textAlign: 'left', cursor: 'pointer' },
                      onclick: () => irA(it.ir) },
          h('div', { class: `av ${d < 0 ? 'neg' : d <= 3 ? 'amb' : ''}` }, icono(it.icono, 17)),
          h('div.m', h('div.t', it.nombre),
            h('div.s', cuandoVence(iso, hoy) + (it.nota ? ` · ${it.nota}` : ''))),
          h('div.v', plata(moneda === 'USD' ? it.monto : Math.round(it.monto), moneda))),
        // Anotar el pago desde acá: es donde uno lo mira, y si hay que ir a
        // buscarlo a otra pantalla se anota después, o nunca.
        it.tarjeta ? h('button.iconbtn', { 'aria-label': `Pagar ${it.nombre}`,
          style: { flex: 'none' },
          onclick: () => formPagoTarjeta(it.tarjeta, it.ciclo, it.monto, moneda) },
          icono('check', 18)) : null);
    }))
  );
}


// -------------------------------------------------------------- bishu
/**
 * Bishu dice una cosa: la que no está en ninguna otra parte de la pantalla.
 *
 * Arriba ya se ve cuánto va gastado y qué se viene. Lo que falta es lo que no
 * se ve mirando un solo mes: si venís gastando más o menos que la vez pasada,
 * y si hace días que no le contás nada a la app —que es de lo que vive.
 */
function tiraBishu(hoy) {
  const p = per();
  const datos = {
    diasSinCargar: F.diasSinCargar(state.transactions, hoy),
    gastadoEsteMesAlDia: F.gastadoAlDia(state.transactions, p, hoy.getDate()),
    gastadoMesPasadoAlDia: F.gastadoAlDia(state.transactions, F.mesAnterior(p), hoy.getDate()),
    cargoHoy: state.transactions.some(t =>
      (!t.fuente || t.fuente === 'manual') && String(t.fecha).slice(0, 10) === hoyISO())
  };
  const { animo, texto } = queDiceBishu(datos, hoy);
  const color = animo === 'festejo' ? 'var(--pos)' : animo === 'alerta' ? 'var(--amb)' : 'var(--bra)';

  return h('section',
    h('div.grp.pad', { style: { display: 'flex', alignItems: 'center', gap: '13px' } },
      h('div', { style: { color, flex: 'none' } }, bishu(animo, 46)),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div', { style: { fontWeight: '600', fontSize: '14.5px', letterSpacing: '-.015em',
                            marginBottom: '2px' } }, '¡Hola! Soy Bishu'),
        h('div', { style: { fontSize: '14.5px', lineHeight: '1.45', color: 'var(--tx2)' } }, texto),
        h('button', { style: { background: 'none', border: '0', padding: '6px 0 0',
                               color: 'var(--tx3)', fontSize: '12.5px', cursor: 'pointer' },
                      onclick: () => irA('/ajustes') }, 'Elegí de qué te aviso'))));
}

// ------------------------------------------------------------- promos
/**
 * Las promos que pediste que te recuerde, con el dia en que caen.
 *
 * Solo las marcadas y a proposito: el buscador trae cincuenta por rubro y
 * ninguna sirve si hay que leerlas todas. Las de una vez al mes —la de
 * combustible de Galicia cae un solo dia— son justo las que uno se pierde,
 * asi que aparecen desde varios dias antes y no el mismo dia.
 */
function promosMarcadas(hoy) {
  const proximas = F.promosQueSeVienen(state.promos, hoy, 14);

  if (!proximas.length) {
    // Sin ninguna marcada la seccion es una sola linea, no un hueco: decir
    // que se puede elegir vale mas que esconderlo.
    const hay = (state.promos || []).some(x => x.activa !== false);
    return h('section',
      h('div.ghead', 'Promos'),
      h('div.grp',
        h('button.li', { onclick: () => irA('/promos') },
          h('div.av', icono('campana', 17)),
          h('div.m', h('div.t', hay ? 'Elegí cuáles te recuerdo' : 'Traé las promos de hoy'),
            h('div.s', hay ? 'Tocá la campana en la que te interese'
                           : 'Las vigentes de tus tarjetas y billeteras')),
          h('span.chev', icono('chev', 15)))));
  }

  return h('section',
    h('div.ghead', 'Promos', h('button', { onclick: () => irA('/promos') }, 'Ver todas')),
    h('div.grp', proximas.slice(0, 5).map(({ promo, fecha }) => {
      const d = Math.round((fecha - new Date(hoy.toDateString())) / 86400000);
      const tope = Number(promo.tope) || 0;
      const uso = (state.promo_usos || []).find(u =>
        u.promo_id === promo.id && u.periodo === per());
      const usado = uso ? Number(uso.usado) : 0;
      const agotada = tope > 0 && usado >= tope;

      return h('div', { class: 'li' + (d === 0 && !agotada ? ' sev sev-amb' : '') },
        h('button', { style: { display: 'flex', alignItems: 'center', gap: '12px',
                               flex: '1', minWidth: '0', background: 'none', border: '0',
                               padding: '0', textAlign: 'left', cursor: 'pointer' },
                      onclick: () => irA('/promos') },
          h('div', { class: 'av' + (d === 0 && !agotada ? ' amb' : '') },
            icono(iconoDe(promo.comercio || promo.titulo || ''), 17)),
          h('div.m',
            h('div.t', promo.titulo || promo.comercio || 'Promo'),
            h('div.s', [cuandoCae(d, fecha),
                        agotada ? 'tope agotado' : null,
                        promo.medio_pago].filter(Boolean).join(' · '))),
          h('div.v', { class: promo.tipo === 'reintegro' ? 'pos' : '' },
            `${Number(promo.valor) || 0}%`)),
        // Sacarla de acá es un toque: si dejó de servir, que no siga ocupando
        // la pantalla que se mira todos los días.
        h('button.iconbtn', { 'aria-label': `Dejar de recordarme ${promo.titulo || 'la promo'}`,
          style: { flex: 'none' },
          onclick: async () => {
            await guardar('promos', { ...promo, recordar: false });
            aviso('No te la recuerdo más');
          } }, icono('cerrar', 17)));
    })));
}

/** 'hoy', 'mañana', 'el jueves 10', y de ahí en más los días que faltan. */
function cuandoCae(d, fecha) {
  if (d <= 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d <= 13) return `el ${DIAS_LARGOS[fecha.getDay()]} ${fecha.getDate()}`;
  return `en ${d} días`;
}
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

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

// =====================================================================
/**
 * Anotar el pago de un resumen, desde donde uno lo está mirando.
 *
 * Un pago de tarjeta es una movida de plata: sale de una cuenta y entra a la
 * tarjeta. Guardarlo así —y no como un gasto— es lo que hace que no se cuente
 * dos veces: el gasto ya se contó cuando se hizo la compra.
 */
export function formPagoTarjeta(tarjeta, ciclo, sugerido, moneda = 'ARS') {
  const cuentas = state.accounts.filter(a =>
    a.activo !== false && a.tipo !== 'credito' && (a.moneda || 'ARS') === moneda);

  const cMonto = h('input', { type: 'text', inputmode: 'decimal',
                              value: String(Math.round(sugerido)) });
  const cCuenta = select(cuentas.map(a => ({ value: a.id, label: etiquetaCuenta(a) })),
                         { value: cuentas[0]?.id || '' });
  const cFecha = h('input', { type: 'date', value: hoyISO() });

  const cerrar = hoja(`Pagar ${tarjeta.nombre}`, h('div',
    h('div.small.mut', { style: { lineHeight: '1.5', marginBottom: '14px' } },
      `Del resumen que vence el ${ciclo.vence.getDate()}/${ciclo.vence.getMonth() + 1}. `,
      'Si pagás una parte, el resto sigue figurando.'),
    campo('Cuánto', cMonto),
    campo('Desde', cCuenta),
    campo('Cuándo', cFecha),
    h('button.btn', { style: { marginTop: '4px' }, onclick: async () => {
      const monto = aNumero(cMonto.value);
      if (!monto) { cMonto.focus(); aviso('Falta el monto'); return; }
      if (!cCuenta.value) { aviso('Falta desde qué cuenta'); return; }
      await guardar('transactions', {
        fecha: cFecha.value || hoyISO(),
        descripcion: `Pago ${tarjeta.nombre}`, comercio: null,
        monto, moneda, tipo: 'transferencia',
        account_id: cCuenta.value, destino_account_id: tarjeta.id,
        cuotas: 1, fuente: 'manual', revisado: true
      });
      cerrar();
      aviso(`Pago anotado · ${plata(monto, moneda)}`);
    } }, 'Anotar el pago')));
}
