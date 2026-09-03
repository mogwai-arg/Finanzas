// =====================================================================
// vistas/estadisticas.js — Números: dónde estás parado.
//
// Las preguntas, en el orden en que uno las hace:
//
//   1. ¿Este mes entró más de lo que salió?      -> la cifra de arriba
//   2. ¿Y comparado con los meses anteriores?    -> las barras por mes
//   3. ¿En qué se fue?                           -> las categorías
//   4. ¿Me estoy pasando de lo que puse?         -> el presupuesto
//   5. ¿Cuánto entra el mes que viene?           -> la proyección del sueldo
//
// El mes en curso va marcado en las dos primeras: comparar un mes por la
// mitad contra meses enteros es la forma más fácil de creerse que se está
// gastando poco.
//
// Presupuesto y proyección vivían en Hoy y en Pagar. Son las dos cosas que
// se miran para saber dónde uno está parado, no para decidir hoy: acá tienen
// una pantalla sola y no se repiten en ninguna otra.
// =====================================================================
import { h, frag, icono, iconoDeCategoria, hoja } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import * as S from '../sueldo.js';
import { plata, plataPartida, hoyISO, buscar, nombreDe, tituloTx } from '../formato.js';
import { barrasHorizontales, barrasPorMes, leyenda } from '../graficos.js';
import { irA } from '../ruteo.js';
import { formPresupuesto } from './formularios.js';
import { formImportarExtracto } from './extracto.js';
import { cargosPorMes } from '../extracto.js';
import { nombreDelMes } from './cierre.js';

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                   'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
                   'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function vistaEstadisticas(root, { moneda = 'ARS' } = {}) {
  const hoy = new Date();
  const per = hoyISO().slice(0, 7);
  const pintar = () => {
    root.replaceChildren(h('div.flow',
      selectorMoneda(moneda),
      balance(per, moneda, hoy),
      porMes(moneda, hoy),
      categorias(per, moneda),
      presupuesto(per, hoy),
      loQueCobraElBanco(hoy),
      puertaAlCierre(hoy),
      mayores(per, moneda),
      proximoSueldo()));
  };
  pintar();
}

function selectorMoneda(actual) {
  const hayUsd = state.accounts.some(a => a.moneda === 'USD') ||
                 state.transactions.some(t => t.moneda === 'USD');
  if (!hayUsd) return null;
  return h('div.seg', { role: 'tablist', 'aria-label': 'Moneda' },
    ...[['ARS', 'Pesos'], ['USD', 'Dólares']].map(([v, txt]) =>
      h('button', { role: 'tab', 'aria-selected': String(actual === v),
                    onclick: () => irA(v === 'ARS' ? '/estadisticas' : '/estadisticas/usd') }, txt)));
}

// --------------------------------------------------------------- balance
/**
 * Lo que entró menos lo que salió, y —al lado— lo que de verdad queda.
 *
 * Antes esta ficha decía "QUEDÓ ESTE MES $ 3.110.877" en verde mientras la
 * plata libre de Hoy decía $ 1.350.971. Dos pantallas de la misma app
 * contestando distinto la misma pregunta, con 1,7 millones de diferencia: es
 * el mismo error que hacía que el ahorro dijera "¡llegaste!" sin plata.
 *
 * Los dos números están bien, pero contestan cosas distintas: la diferencia
 * del mes es del mes, la plata libre es de ahora y ya le restó los resúmenes
 * y los fijos que faltan. Así que van juntos y con el nombre correcto: el de
 * arriba es la diferencia, no lo que hay.
 */
function balance(per, moneda, hoy) {
  const r = F.resumenMes(state.transactions, per, moneda);
  const dia = hoy.getDate();
  const enElMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const dif = Math.round(r.ingresos - r.gastos);
  const enCurso = per === hoyISO().slice(0, 7);
  const { simbolo, numero } = plataPartida(dif, moneda);
  const pl = F.plataLibre(state.accounts, state.transactions, state.recurrings,
                          state.recurring_payments, hoy, moneda);
  const hayLibre = pl.enCuentas || pl.resumenes || pl.fijos;

  return h('button.grp.pad', { style: { width: '100%', textAlign: 'left', border: '0',
                                        display: 'block', cursor: 'pointer' },
                               onclick: () => hojaDeDondeSale(per, moneda) },
    h('div.ghead', { style: { margin: '0 0 5px' } }, 'Entró y salió este mes',
      h('span', { style: { textTransform: 'none', letterSpacing: '0' } }, 'De dónde sale')),
    // El mes en curso NO se pinta: con el sueldo adentro el día 1 y los
    // gastos sin hacer, un número verde enorme dice "vas bárbaro" todos los
    // meses. El color se gana cuando el mes cerró.
    h('div', { class: 'cifra' + (enCurso ? '' : dif >= 0 ? ' pos' : ' neg') },
      h('em', simbolo), numero),
    h('div.small.mut', { style: { marginTop: '5px' } },
      `entró ${plata(Math.round(r.ingresos), moneda)} · salió ${plata(Math.round(r.gastos), moneda)}`),

    hayLibre ? h('div', { style: { marginTop: '13px', paddingTop: '13px',
                                   borderTop: '1px solid var(--line)' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between',
                          alignItems: 'baseline', gap: '10px' } },
        h('span.small.mut', 'Plata libre hoy'),
        h('span', { class: 'tabnum' + (pl.libre < 0 ? ' neg' : ''),
                    style: { fontWeight: '700', fontSize: '17px' } },
          plata(Math.round(pl.libre), moneda))),
      h('div.small.mut', { style: { marginTop: '6px', lineHeight: '1.45' } },
        'La diferencia de arriba no es lo que tenés: le falta restar los ',
        'resúmenes de tarjeta y los gastos fijos que todavía no pagaste. ',
        'Eso ya está restado en la plata libre.')) : null,

    h('div.small.mut', { style: { marginTop: '11px', paddingTop: '11px',
                                  borderTop: '1px solid var(--line)', lineHeight: '1.5' } },
      `Va el día ${dia} de ${enElMes}: el mes todavía no terminó, así que la `,
      'diferencia se mueve hasta fin de mes.'));
}

/**
 * De dónde sale cada número, fila por fila.
 *
 * Un total que no cierra con la cabeza de uno no se puede discutir: o se le
 * cree a la app o no se le cree, y cuando no se le cree la app deja de servir
 * para lo único que sirve. Así que el número se abre y se puede auditar.
 *
 * Lo que quedó AFUERA es la mitad de la explicación: una movida entre cuentas
 * propias y un pago de tarjeta no son gasto —el gasto ya se contó el día de la
 * compra— y son justo los importes grandes que uno espera ver en el total.
 */
function hojaDeDondeSale(per, moneda) {
  const d = F.deDondeSale(state.transactions, per, moneda, state.accounts);
  const m = Number(per.slice(5, 7));
  const linea = (izq, der, chico) => h('div.li',
    h('div.m', h('div.t', izq), chico ? h('div.s', chico) : null),
    h('div.v', der));

  return hoja(`${MES_LARGO[m - 1]}, de dónde sale`, h('div.flow', { style: { gap: '16px' } },

    h('div',
      h('div.ghead', 'Entró', h('span.tabnum', { style: { textTransform: 'none',
                                                          letterSpacing: '0' } },
        plata(d.totalIngresos, moneda))),
      d.ingresos.length
        ? h('div.grp', d.ingresos.map(({ tx, monto }) => linea(
            tituloTx(tx), plata(Math.round(monto), moneda),
            `${String(tx.fecha).slice(8, 10)}/${String(tx.fecha).slice(5, 7)}` +
            (tx.account_id ? ` · ${nombreDe('accounts', tx.account_id, '')}` : ''))))
        : h('div.grp.pad', h('div.small.mut', 'No hay ingresos cargados este mes.'))),

    h('div',
      h('div.ghead', `Salió · ${d.cuantosGastos} ${d.cuantosGastos === 1 ? 'gasto' : 'gastos'}`,
        h('span.tabnum', { style: { textTransform: 'none', letterSpacing: '0' } },
          plata(d.totalGastos, moneda))),
      // Las categorías suman EXACTAMENTE el total de arriba: eso es lo que
      // hace que el número se pueda verificar en vez de creer.
      h('div.grp', d.categorias.map(c => linea(
        c.id ? nombreDe('categories', c.id, 'Sin categoría') : 'Sin categoría',
        plata(Math.round(c.monto), moneda),
        `${c.cuantos} ${c.cuantos === 1 ? 'movimiento' : 'movimientos'}`)))),

    (d.movidas.cuantas || d.pagosTarjeta.cuantos) ? h('div',
      h('div.ghead', 'No cuenta como gasto'),
      h('div.grp',
        d.pagosTarjeta.cuantos ? linea('Pagos de tarjeta',
          plata(Math.round(d.pagosTarjeta.monto), moneda),
          'el gasto ya se contó el día de la compra') : null,
        d.movidas.cuantas ? linea('Movidas entre tus cuentas',
          plata(Math.round(d.movidas.monto), moneda),
          `${d.movidas.cuantas} ${d.movidas.cuantas === 1 ? 'movimiento' : 'movimientos'}`) : null))
      : null,

    d.repetidos.length ? h('div',
      h('div.ghead', 'Puede estar cargado dos veces'),
      h('div.grp', d.repetidos.slice(0, 8).map(r => linea(
        r.txs.map(t => tituloTx(t)).join(' · ').slice(0, 46),
        `${r.cuantos} × ${plata(Math.round(r.monto), moneda)}`,
        `${r.fecha.slice(8, 10)}/${r.fecha.slice(5, 7)} · mismo día y mismo importe`))),
      h('div.small.mut', { style: { padding: '10px 4px 0', lineHeight: '1.5' } },
        'Pasa cuando el mismo consumo entra por el correo y además se importa ',
        'del resumen. Dos cafés iguales el mismo día también existen, así que ',
        'no se borran solos: miralos en Gastos y borrá el que sobre.'),
      h('button.btn.sec', { style: { marginTop: '10px' },
                            onclick: () => irA('/gastos') }, 'Ver en Gastos')) : null,

    h('div.small.mut', { style: { lineHeight: '1.5' } },
      'Si algún número no cierra, es acá donde se ve por qué. Los gastos de ',
      'arriba son los del mes en que se compraron, no los del mes en que se ',
      'pagan: una compra en cuotas cuenta entera el día que la hiciste.')));
}

// ---------------------------------------------------------------- por mes
function porMes(moneda, hoy) {
  const serie = F.serieMensual(state.transactions, 6, moneda, hoy)
    .map(m => ({ ...m, nombre: MES_CORTO[Number(m.periodo.slice(5, 7)) - 1] }));
  if (!serie.some(m => m.ingresos || m.gastos)) return null;

  const cerrados = serie.filter(m => !m.enCurso && (m.ingresos || m.gastos));
  const promedio = cerrados.length
    ? cerrados.reduce((s, m) => s + m.gastos, 0) / cerrados.length : 0;

  // El mes elegido se escribe con palabras abajo del gráfico: es lo que
  // reemplaza al tooltip, que en un teléfono no existe.
  const detalle = h('div.small', { style: { marginTop: '13px', paddingTop: '13px',
                                            borderTop: '1px solid var(--line)',
                                            lineHeight: '1.5', color: 'var(--tx2)' } });
  const elDetalle = m => {
    const bal = m.ingresos - m.gastos;
    detalle.replaceChildren(
      h('b', { style: { color: 'var(--tx)' } }, MES_LARGO[Number(m.periodo.slice(5, 7)) - 1]),
      m.enCurso ? ' (en curso)' : '', ': entró ',
      h('b', { style: { color: 'var(--tx)' } }, plata(Math.round(m.ingresos), moneda)),
      ' y salió ',
      h('b', { style: { color: 'var(--tx)' } }, plata(Math.round(m.gastos), moneda)),
      m.ingresos || m.gastos
        // "Quedaron" no: lo que quedó son las cuentas menos lo que se debe, y
        // eso es la plata libre. Esto es una resta del mes y nada más.
        ? frag('. La diferencia fue ',
            h('b', { style: { color: m.enCurso ? 'var(--tx)'
                                    : bal >= 0 ? 'var(--pos)' : 'var(--amb)' } },
              plata(Math.round(bal), moneda)), '.')
        : '. No hay nada cargado en ese mes.');
  };

  return h('section',
    h('div.ghead', 'Mes a mes'),
    h('div.grp.pad',
      leyenda(['in', 'entró'], ['out', 'salió']),
      h('div', { style: { marginTop: '14px' } },
        barrasPorMes(serie, { moneda, alElegir: elDetalle })),
      detalle,
      promedio > 0 ? h('div.small.mut', { style: { marginTop: '11px', lineHeight: '1.5' } },
        'Gastás ', h('b', { style: { color: 'var(--tx)' } },
          plata(Math.round(promedio), moneda)),
        ` por mes en promedio, sin contar el que está en curso.`) : null));
}

// ------------------------------------------------------------ categorías
function categorias(per, moneda) {
  const cs = F.gastoPorCategoria(state.transactions, per, moneda);
  if (!cs.length) {
    return h('section',
      h('div.ghead', 'En qué se fue'),
      h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.5' } },
        'Todavía no hay gastos este mes. Cuando cargues alguno, acá se ve en qué ',
        'se fue, de mayor a menor.')));
  }
  const datos = cs.slice(0, 8).map(c => ({
    etiqueta: c.id ? (buscar('categories', c.id)?.nombre || 'Sin categoría') : 'Sin categoría',
    monto: c.monto,
    nota: `${Math.round(c.parte * 100)} % de lo que gastaste`,
    id: c.id
  }));

  return h('section',
    // Un "4" suelto al lado del título no decía de qué era.
    h('div.ghead', 'En qué se fue',
      h('span.mut', { style: { textTransform: 'none', letterSpacing: '0', fontWeight: '500' } },
        `${cs.length} ${cs.length === 1 ? 'categoría' : 'categorías'}`)),
    h('div.grp.pad', barrasHorizontales(datos, { moneda,
      alFila: d => irA('/gastos') })),
    cs.length > 8 ? h('div.small.mut', { style: { padding: '10px 4px 0' } },
      `y ${cs.length - 8} categorías más, todas por debajo de las de arriba`) : null);
}

// -------------------------------------------------------- los más grandes
/**
 * Los cinco gastos más grandes del mes, uno por uno.
 *
 * El gráfico por categoría dice "supermercado, 200.000". Esto dice cuál de
 * todas las compras fue la que pesó, que es lo que uno recuerda y lo que
 * puede decidir no repetir.
 */
function mayores(per, moneda) {
  const tx = state.transactions
    .filter(t => t.tipo === 'gasto' && (t.moneda || 'ARS') === moneda &&
                 F.periodo(F.parseFecha(t.fecha)) === per)
    .sort((a, b) => Number(b.monto) - Number(a.monto))
    .slice(0, 5);
  if (tx.length < 2) return null;

  return h('section',
    h('div.ghead', 'Los más grandes del mes'),
    h('div.grp', tx.map(t => {
      const cat = t.category_id ? buscar('categories', t.category_id) : null;
      return h('div.li',
        h('div.av', icono(cat ? iconoDeCategoria(cat) : 'varios', 17)),
        h('div.m', h('div.t', t.comercio || t.descripcion || 'Gasto'),
          h('div.s', [cat?.nombre, t.cuotas > 1 ? `${t.cuotas} cuotas` : null,
                      t.fecha.slice(8, 10) + '/' + t.fecha.slice(5, 7)]
            .filter(Boolean).join(' · '))),
        h('div.v', plata(Math.round(t.monto), moneda)));
    })));
}

/**
 * Lo que te cobra el banco, mes a mes.
 *
 * Son los gastos que no manda ningún aviso y que nadie carga a mano:
 * mantenimiento, seguros que se renuevan solos, el impuesto al débito y al
 * crédito, retenciones. Uno de 18.500 no es nada; doce son 222.000, y esa es
 * la única cifra con la que se puede discutir un paquete.
 */
function loQueCobraElBanco(hoy) {
  const serie = cargosPorMes(state.transactions, 6, hoy);
  const conAlgo = serie.filter(m => m.total > 0);
  if (!conAlgo.length) return null;

  const ultimo = serie[serie.length - 1];
  const cerrados = serie.slice(0, -1).filter(m => m.total > 0);
  const promedio = cerrados.length
    ? cerrados.reduce((s, m) => s + m.total, 0) / cerrados.length : ultimo.total;

  return h('section',
    h('div.ghead', 'Lo que te cobra el banco',
      h('button', { onclick: () => formImportarExtracto() }, 'Subir resumen')),
    h('div.grp.pad',
      h('div', { class: 'cifra', style: { fontSize: 'var(--t-cifra2)' } },
        plata(Math.round(ultimo.total))),
      h('div.small.mut', { style: { marginTop: '5px' } },
        `este mes · ${ultimo.cuantos} ${ultimo.cuantos === 1 ? 'cargo' : 'cargos'}`),
      promedio > 0 ? h('div.small.mut', {
        style: { marginTop: '11px', paddingTop: '11px',
                 borderTop: '1px solid var(--line)', lineHeight: '1.5' } },
        'A este ritmo son ',
        h('b', { style: { color: 'var(--tx)' } }, plata(Math.round(promedio * 12))),
        ' por año. Es lo que sale el paquete, y es el número con el que se ',
        'pide cambiarlo.') : null),
    ultimo.conceptos.length ? h('div.grp', { style: { marginTop: '10px' } },
      ultimo.conceptos.map(c => h('div.li',
        h('div.av', icono('banco', 15)),
        h('div.m', h('div.t', c.nombre),
          h('div.s', `${c.cuantos} ${c.cuantos === 1 ? 'cargo' : 'cargos'} este mes`)),
        h('div.v', plata(Math.round(c.monto)))))) : null);
}

/** El cierre del último mes completo, desde acá también y todo el mes. */
function puertaAlCierre(hoy) {
  const per = F.ultimoMesCerrado(hoy);
  if (!state.transactions.some(t => String(t.fecha).slice(0, 7) === per)) return null;
  return h('section',
    h('div.grp',
      h('button.li', { onclick: () => irA(`/cierre/${per}`) },
        h('div.av', icono('reloj', 17)),
        h('div.m', h('div.t', `Cómo cerró ${nombreDelMes(per).toLowerCase()}`),
          h('div.s', 'Lo que quedó, contra el mes anterior, y con tus topes')),
        h('span.chev', icono('chev', 15)))));
}

// --------------------------------------------------------- presupuesto
/**
 * Los topes del mes: por categoría, por tarjeta y el ideal de ahorro.
 *
 * Estaba en Hoy y en Pagar a la vez, con pie de fila distinto en cada una.
 * Una sola versión, y la completa.
 */
function presupuesto(per, hoy) {
  const budgets = state.budgets.filter(b => b.periodo === per);
  const alertPct = Number(state.settings?.alert_pct) || 80;
  const res = F.resumenMes(state.transactions, per, 'ARS');
  const porCuenta = F.estadoPorCuenta(budgets, state.transactions, per, alertPct);
  const paraAhorro = { cuentas: state.accounts, txs: state.transactions,
                       recurrings: state.recurrings, pagos: state.recurring_payments };
  const ahorro = ['ARS', 'USD']
    .map(m => F.estadoAhorro(budgets, paraAhorro, per, m, hoy)).filter(Boolean);

  return h('section',
    h('div.ghead', 'Presupuesto',
      h('button', { onclick: () => formPresupuesto(per) },
        budgets.length ? 'Ajustar' : 'Definir')),
    budgets.length
      ? h('div',
          h('div.grp', F.estadoPresupuesto(budgets, res, alertPct).map(b => filaPresupuesto(b))),
          porCuenta.length ? h('div', { style: { marginTop: '16px' } },
            h('div.ghead', 'Tope por tarjeta'),
            h('div.grp', porCuenta.map(b =>
              filaPresupuesto(b, nombreDe('accounts', b.account_id))))) : null,
          ahorro.length ? h('div', { style: { marginTop: '16px' } },
            h('div.ghead', 'Ideal de ahorro'),
            h('div.grp', ahorro.map(filaAhorro))) : null)
      : h('div.grp.pad', h('div.small.mut', { style: { lineHeight: '1.5' } },
          'Sin topes cargados no hay con qué comparar el gasto del mes. ',
          'Empezá por tres categorías, no por diez.')));
}

/**
 * El ahorro no es un tope que no hay que pasar: es un piso al que llegar, y
 * por eso se muestra al revés que un presupuesto: cuánto falta, no cuánto
 * queda.
 *
 * Y con el mes corriendo NO se declara cumplido. El día 3, con el sueldo
 * adentro y los gastos sin hacer, la plata libre está arriba de cualquier
 * meta: festejar ahí es felicitar a alguien que no tiene plata. Mientras el
 * mes corre se dice cómo viene y contra qué compararlo.
 */
function filaAhorro(a) {
  const nombre = a.moneda === 'USD' ? 'En dólares' : 'En pesos';
  // Con signo, siempre. Sin él, "pasó de $ 1.930.458 a $ 1.350.971" escondía
  // que el primero era NEGATIVO y que la plata libre había subido, no bajado.
  const con = n => (n < 0 ? '−' : '') + plata(Math.round(Math.abs(n)), a.moneda);

  return h('div', { style: { padding: '13px 14px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', gap: '10px' } },
      h('span', { style: { fontSize: '14.5px', fontWeight: '500' } }, nombre),
      h('span.small.mut',
        h('b', { style: { color: a.ahorrado < 0 ? 'var(--amb)'
                                : a.logrado ? 'var(--pos)' : 'var(--tx)' } }, con(a.ahorrado)),
        ` de ${plata(a.tope, a.moneda)}`)),

    // La barra aparece cuando el mes cerró. Mientras corre, una barra llena se
    // lee como "listo", y el día 3 —con el sueldo adentro y los gastos sin
    // hacer— eso es felicitar a alguien que todavía no ahorró nada.
    !a.enCurso ? h('div.mini',
      h('b', { style: { flex: String(Math.max(1, a.pct)) } }),
      h('span', { style: { flex: String(Math.max(1, 100 - a.pct)) } })) : null,

    h('div.small.mut', { style: { marginTop: '7px', lineHeight: '1.45' } },
      a.enCurso
        ? frag('Así viene, y faltan ', h('b', { style: { color: 'var(--tx)' } },
            `${a.dias} ${a.dias === 1 ? 'día' : 'días'}`),
            ' de gastos. ',
            a.referencia != null
              ? `A esta altura del mes pasado ibas ${con(a.referencia)}.`
              : 'Todavía no hay un mes anterior con qué comparar.')
        : a.logrado ? '¡Llegaste!'
        : a.ahorrado < 0 ? `El mes cerró ${con(a.ahorrado)}: se fue más de lo que entró.`
        : `Te faltaron ${con(a.falta)}.`),

    // De dónde sale el número: sin esto, un ahorro que no cierra no se puede
    // discutir con la app.
    h('div.small.mut', { style: { marginTop: '4px', color: 'var(--tx3)' } },
      `tu plata libre pasó de ${con(a.desde)} a ${con(a.ahora)}`));
}

function filaPresupuesto(b, nombre) {
  const nom = nombre || nombreDe('categories', b.category_id, 'Sin categoría');
  const dentro = Math.min(b.gastado, b.tope);
  const exceso = Math.max(0, b.gastado - b.tope);
  return h('div', { style: { padding: '13px 14px', position: 'relative' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', gap: '10px' } },
      h('span', { style: { fontSize: '14.5px', fontWeight: '500' } }, nom),
      h('span.small.mut', h('b', { style: { color: 'var(--tx)' } },
        plata(Math.round(b.gastado), b.moneda || 'ARS')),
        ` de ${plata(b.tope, b.moneda || 'ARS')}`)),
    // El tramo vacío tiene que estar: con Math.max(1, …) y sin hermano, una
    // categoría en cero dibujaba la barra ENTERA llena. Se veía como gastado
    // todo el tope justo donde no se gastó nada.
    h('div.mini',
      dentro > 0 ? h('b', { class: b.pct >= 80 ? 'al' : '',
                            style: { flex: String(dentro) } }) : null,
      exceso > 0 ? h('s', { style: { flex: String(exceso) } }) : null,
      b.restante > 0 ? h('span', { style: { flex: String(b.restante) } }) : null),
    exceso > 0 && h('div', {
      style: { fontSize: '12.5px', color: 'var(--amb)', fontWeight: '600', marginTop: '7px' } },
      `${plata(Math.round(exceso), b.moneda || 'ARS')} de más`),
    exceso === 0 && b.restante > 0 && h('div.small.mut', { style: { marginTop: '7px' } },
      `quedan ${plata(Math.round(b.restante), b.moneda || 'ARS')}`));
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
          // El segundo escalón de la escala: es una proyección del mes que
          // viene y no tiene que ganarle a la cifra de la pantalla.
          h('div', { class: 'cifra' + (state.ocultarMontos ? ' oculto' : ''),
                     style: { fontSize: 'var(--t-cifra2)' } }, plata(Math.round(cobro.total))),
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
