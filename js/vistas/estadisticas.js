// =====================================================================
// vistas/estadisticas.js — dónde estás parado.
//
// Tres preguntas, en el orden en que uno las hace:
//
//   1. ¿Este mes entró más de lo que salió?      -> la cifra de arriba
//   2. ¿Y comparado con los meses anteriores?    -> las barras por mes
//   3. ¿En qué se fue?                           -> las categorías
//
// El mes en curso va marcado en las dos primeras: comparar un mes por la
// mitad contra meses enteros es la forma más fácil de creerse que se está
// gastando poco.
// =====================================================================
import { h, frag, icono, iconoDeCategoria } from '../ui.js';
import { state } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, hoyISO, buscar } from '../formato.js';
import { barrasHorizontales, barrasPorMes, leyenda } from '../graficos.js';
import { irA } from '../ruteo.js';

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
      mayores(per, moneda)));
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
 * Lo que quedó este mes: entró menos salió.
 *
 * Va arriba y en grande porque es la única cifra que contesta la pregunta de
 * fondo. Positivo no se pinta de verde a lo loco: el mes en curso puede estar
 * en verde solo porque el sueldo entró el 1 y los gastos todavía no.
 */
function balance(per, moneda, hoy) {
  const r = F.resumenMes(state.transactions, per, moneda);
  const dia = hoy.getDate();
  const enElMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const { simbolo, numero } = plataPartida(Math.round(r.ingresos - r.gastos), moneda);
  const bien = r.ingresos - r.gastos >= 0;

  return h('div.grp.pad',
    h('div.ghead', { style: { margin: '0 0 5px' } }, 'Quedó este mes'),
    h('div', { class: 'cifra' + (bien ? ' pos' : ' neg') }, h('em', simbolo), numero),
    h('div.small.mut', { style: { marginTop: '5px' } },
      `entró ${plata(Math.round(r.ingresos), moneda)} · salió ${plata(Math.round(r.gastos), moneda)}`),
    h('div.small.mut', { style: { marginTop: '11px', paddingTop: '11px',
                                  borderTop: '1px solid var(--line)', lineHeight: '1.5' } },
      `Va el día ${dia} de ${enElMes}: el mes todavía no terminó, así que el número `,
      'se mueve hasta fin de mes.'));
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
        ? frag('. Quedaron ', h('b', { style: { color: bal >= 0 ? 'var(--pos)' : 'var(--amb)' } },
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
    h('div.ghead', 'En qué se fue', h('span.mut', `${cs.length}`)),
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
