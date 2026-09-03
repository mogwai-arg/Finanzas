// =====================================================================
// vistas/cierre.js — cómo cerró el mes.
//
// Es lo que le faltaba a la app para que valga la pena cargar todos los días:
// uno anota gastos durante treinta días y no pasa nada. El día 1 tiene que
// pasar algo.
//
// Y es el único momento en que un número se puede pintar de verde sin mentir,
// porque el mes ya no se mueve. Durante el mes en curso, cualquier color es
// una promesa: el sueldo entró el 1 y los gastos todavía no salieron.
//
// El tono es el de Bishu y las reglas son las mismas: una cosa por vez, sin
// retar, sin medallas. En una app de plata la racha rota se lee como culpa, y
// la culpa es la razón número uno por la que se abandonan.
// =====================================================================
import { h, frag, icono, aviso } from '../ui.js';
import { state, guardar } from '../db.js';
import * as F from '../finance.js';
import { plata, plataPartida, nombreDe } from '../formato.js';
import { bishu } from '../bishu.js';
import { irA } from '../ruteo.js';

const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
             'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const nombreDelMes = per => {
  const [y, m] = per.split('-').map(Number);
  return MES[m - 1] + (y === new Date().getFullYear() ? '' : ` ${y}`);
};

export function vistaCierre(root, params) {
  const hoy = new Date();
  const per = params?.per || F.ultimoMesCerrado(hoy);
  const d = F.cierreDeMes(datos(), per, 'ARS', hoy);

  if (!d) {
    root.append(h('div.flow', h('div.vacio', { style: { padding: '40px 24px' } },
      h('div.ic', icono('reloj', 24)),
      h('h3', 'Ese mes todavía no cerró'),
      h('p', 'El cierre aparece el día 1, cuando el mes ya no se mueve.'),
      h('button.btn.sec', { onclick: () => irA('/hoy') }, 'Volver'))));
    return;
  }

  root.append(h('div.flow',
    saludo(d),
    loQueQuedo(d),
    comparacion(d),
    conElPresupuesto(d),
    propuesta(d),
    h('button.btn.sec', { onclick: () => irA('/estadisticas') },
      icono('tendencia', 17), 'Ver los números del mes'),
    otrosMeses(per, hoy)));
}

function datos() {
  return { cuentas: state.accounts, txs: state.transactions, recurrings: state.recurrings,
           pagos: state.recurring_payments, budgets: state.budgets,
           categorias: state.categories };
}

// --------------------------------------------------------------- saludo
/**
 * Lo primero que se lee, y lo único que hace falta si no se lee nada más.
 *
 * Sale del hecho más fuerte del mes, en este orden: si gastaste menos que el
 * mes pasado, si llegaste al ahorro, si te pasaste en algo, y si no, cuánto
 * cargaste. No hay felicitación genérica: si no pasó nada, no se inventa.
 */
function saludo(d) {
  const mes = nombreDelMes(d.periodo);
  let animo = 'contento', texto;

  if (d.ahorro && d.ahorro.logrado) {
    animo = 'festejo';
    texto = `Llegaste al ahorro que te pusiste: ${plata(d.ahorro.ahorrado, d.moneda)}.`;
  } else if (d.hayConQueComparar && d.gastasteMenos > 0) {
    animo = 'festejo';
    texto = `Gastaste ${plata(d.gastasteMenos, d.moneda)} menos que en ` +
            `${nombreDelMes(d.previo).toLowerCase()}.`;
  } else if (d.pasadas.length) {
    animo = 'atento';
    texto = d.pasadas.length === 1
      ? `Se pasó ${d.pasadas[0].nombre.toLowerCase()}, el resto entró en lo previsto.`
      : `Se pasaron ${d.pasadas.length} categorías del tope.`;
  } else if (d.hayConQueComparar && d.gastasteMenos < 0) {
    animo = 'atento';
    texto = `Gastaste ${plata(-d.gastasteMenos, d.moneda)} más que en ` +
            `${nombreDelMes(d.previo).toLowerCase()}.`;
  } else if (d.salio > 0) {
    // El primer mes no tiene con qué compararse. Decir algo cierto y chico es
    // mejor que felicitar por nada.
    texto = `Salió ${plata(d.salio, d.moneda)} en ${d.cargados} ` +
            `${d.cargados === 1 ? 'movimiento' : 'movimientos'}. ` +
            'Con un mes más ya te puedo comparar.';
  } else {
    texto = 'No hay nada cargado en ese mes.';
  }

  return h('div.grp.pad', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
    h('div', { style: { flex: 'none', color: animo === 'festejo' ? 'var(--pos)'
                                           : animo === 'atento' ? 'var(--amb)' : 'var(--bra)' } },
      bishu(animo, 52)),
    h('div',
      h('div', { style: { fontWeight: '700', fontSize: '17px', letterSpacing: '-.02em',
                          marginBottom: '3px' } }, `Así cerró ${mes.toLowerCase()}`),
      h('div', { style: { fontSize: '14.5px', lineHeight: '1.45', color: 'var(--tx2)' } },
        texto)));
}

// ------------------------------------------------------------ lo que quedó
function loQueQuedo(d) {
  const { simbolo, numero } = plataPartida(Math.round(d.quedo), d.moneda);
  return h('section',
    h('div.ghead', 'Lo que quedó'),
    h('div.grp.pad',
      // Acá SÍ se pinta: el mes cerró, el número ya no se mueve y el color no
      // es una promesa.
      h('div', { class: 'cifra' + (d.quedo >= 0 ? ' pos' : ' neg') +
                        (state.ocultarMontos ? ' oculto' : '') }, h('em', simbolo), numero),
      h('div.small.mut', { style: { marginTop: '5px' } },
        `entró ${plata(d.entro, d.moneda)} · salió ${plata(d.salio, d.moneda)}`),
      h('div.small.mut', { style: { marginTop: '11px', paddingTop: '11px',
                                    borderTop: '1px solid var(--line)', lineHeight: '1.5' } },
        // La misma explicación que en Números: la diferencia del mes no es lo
        // que quedó. Lo que quedó es cuánto subió la plata libre.
        'No es "entró menos salió": es cuánto subió tu plata libre, que ya ',
        'tiene restados los resúmenes y los fijos. Pasó de ',
        h('b', { style: { color: 'var(--tx)' } }, plata(d.desde, d.moneda)),
        ' a ', h('b', { style: { color: 'var(--tx)' } }, plata(d.hasta, d.moneda)), '.')));
}

// ------------------------------------------------------------ comparación
function comparacion(d) {
  if (!d.subio && !d.bajo && !d.mayor) return null;
  const fila = (rot, c, signo) => h('div.li',
    h('div', { class: 'av ' + (signo > 0 ? 'amb' : 'pos') },
      h('span', { style: { display: 'grid', transform: signo > 0 ? 'none' : 'rotate(180deg)' } },
        icono('sube', 15))),
    h('div.m', h('div.t', c.nombre),
      h('div.s', `${plata(c.antes, d.moneda)} → ${plata(c.monto, d.moneda)}`)),
    h('div.v', { style: { color: signo > 0 ? 'var(--amb)' : 'var(--pos)' } },
      plata(c.cambio, d.moneda, { signo: true })));

  return h('section',
    // Sin mes anterior con qué comparar, el encabezado no puede prometer una
    // comparación que no hay.
    h('div.ghead', d.hayConQueComparar ? `Contra ${nombreDelMes(d.previo).toLowerCase()}`
                                       : 'Del mes'),
    h('div.grp',
      d.subio ? fila('subió', d.subio, 1) : null,
      d.bajo ? fila('bajó', d.bajo, -1) : null,
      d.mayor ? h('div.li',
        h('div.av', icono('billete', 15)),
        h('div.m', h('div.t', 'El gasto más grande'),
          h('div.s', `${d.mayor.nombre} · ${d.mayor.categoria}`)),
        h('div.v', plata(d.mayor.monto, d.moneda))) : null),
    !d.hayConQueComparar ? h('div.small.mut', { style: { padding: '10px 4px 0' } },
      'Todavía no hay un mes anterior completo con qué comparar.') : null);
}

// ----------------------------------------------------------- presupuesto
function conElPresupuesto(d) {
  if (!d.presupuesto.length) return null;
  return h('section',
    h('div.ghead', 'Con lo que te habías puesto'),
    h('div.grp', d.presupuesto.map(b => {
      const paso = b.gastado > b.tope;
      const dif = Math.round(Math.abs(b.gastado - b.tope));
      return h('div.li',
        h('div', { class: 'av ' + (paso ? 'amb' : 'pos') },
          icono(paso ? 'sube' : 'check', 15)),
        h('div.m', h('div.t', b.nombre),
          h('div.s', paso ? `${plata(dif, d.moneda)} de más` : `te sobraron ${plata(dif, d.moneda)}`)),
        h('div.v', { style: { color: paso ? 'var(--amb)' : 'var(--tx2)' } },
          plata(Math.round(b.gastado), d.moneda), h('small', `de ${plata(b.tope, d.moneda)}`)));
    })));
}

// -------------------------------------------------------------- propuesta
/**
 * Una sola cosa para el mes que arranca.
 *
 * Definir un presupuesto de cero es la tarea que nadie hace: pedirle a alguien
 * que invente diez topes en enero es pedirle que no lo haga. Proponer UNO, con
 * el número que ya gastó, es una decisión de un toque.
 */
function propuesta(d) {
  if (!d.proponer) return null;
  const p = d.proponer;
  const per = F.periodo(new Date());
  const btn = h('button.btn', `Poner ${plata(p.tope, d.moneda)} de tope`);
  btn.onclick = async () => {
    btn.disabled = true;
    await guardar('budgets', { periodo: per, category_id: p.categoria,
                               monto: p.tope, moneda: d.moneda, clase: 'categoria' });
    aviso(`Listo, ${p.nombre.toLowerCase()} tiene tope este mes`);
    irA('/estadisticas');
  };
  return h('section',
    h('div.ghead', 'Para el mes que arranca'),
    h('div.grp.pad',
      h('div', { style: { fontSize: '14.5px', lineHeight: '1.5', color: 'var(--tx2)' } },
        h('b', { style: { color: 'var(--tx)' } }, p.nombre), ' es lo que más subió y no ',
        'tiene tope puesto. Poniéndole uno, la app te avisa antes de que se pase, ',
        'no después.'),
      h('div', { style: { marginTop: '14px' } }, btn)));
}

// ------------------------------------------------------------ otros meses
function otrosMeses(per, hoy) {
  const previos = [];
  for (let i = 1; i <= 5; i++) {
    const p = F.mesAnterior(i === 1 ? per : previos[previos.length - 1]);
    previos.push(p);
  }
  const hay = previos.filter(p => state.transactions.some(t => String(t.fecha).slice(0, 7) === p));
  if (!hay.length) return null;
  return h('section',
    h('div.ghead', 'Meses anteriores'),
    h('div.grp', hay.map(p => h('button.li', { onclick: () => irA(`/cierre/${p}`) },
      h('div.m', h('div.t', nombreDelMes(p))),
      h('span.chev', icono('chev', 15))))));
}
