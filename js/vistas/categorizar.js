// =====================================================================
// vistas/categorizar.js — ponerle categoría a todo de una.
//
// Los consumos que entran por el resumen de la tarjeta vienen sin categoría, y
// de a uno son cuarenta toques que nadie da. El resultado es un pozo enorme
// llamado "sin categoría" en el gráfico de en qué se fue, que lo vuelve
// inútil justo cuando más plata tiene adentro.
//
// La idea es una sola: los seis COTO de un resumen son UNA fila. Se agrupa por
// comercio, se propone una categoría con el motivo al lado, y un toque
// resuelve el grupo entero.
//
// Y cada vez que se resuelve un grupo queda la regla aprendida, así que la
// próxima vez que aparezca ese comercio ya viene puesto. La pantalla se vacía
// sola con el uso, que es como tiene que envejecer.
// =====================================================================
import { h, icono, iconoDeCategoria, aviso, hoja } from '../ui.js';
import { state, guardar, guardarVarios } from '../db.js';
import { sinCategoria, comoRegla, reglaQueChoca } from '../reglas.js';
import { plata, nombreDe } from '../formato.js';
import { irA } from '../ruteo.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
               'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dia = iso => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

export function vistaCategorizar(root) {
  const cats = (state.categories || []).filter(c => c.tipo !== 'ingreso');

  const pintar = () => {
    const grupos = sinCategoria(state.transactions, state);
    if (!grupos.length) {
      root.replaceChildren(h('div.flow',
        h('div.grp.pad', { style: { textAlign: 'center', padding: '34px 20px' } },
          h('div', { style: { color: 'var(--pos)', marginBottom: '12px' } }, icono('check', 34)),
          h('div', { style: { fontSize: '16px', fontWeight: '600' } }, 'Está todo categorizado'),
          h('div.small.mut', { style: { marginTop: '7px', lineHeight: '1.5' } },
            'Cuando entren consumos nuevos del resumen, van a aparecer acá.')),
        h('button.btn.sec', { onclick: () => irA('/estadisticas') },
          icono('tendencia', 16), 'Ver en qué se fue')));
      return;
    }

    const total = grupos.reduce((s, g) => s + g.total, 0);
    const cuantos = grupos.reduce((s, g) => s + g.cuantos, 0);
    // Las que se pueden aceptar sin mirar: hay una regla escrita o la historia
    // lo dice dos veces. Lo adivinado por el nombre no entra acá —eso hay que
    // mirarlo— y esa es toda la diferencia entre ayudar y ensuciar.
    const seguras = grupos.filter(g => g.sugerida && g.seguro);

    root.replaceChildren(h('div.flow',
      h('div.grp.pad',
        h('div', { style: { fontSize: '15px', lineHeight: '1.5' } },
          h('b', plata(Math.round(total))), ' en ', h('b', String(cuantos)),
          ` ${cuantos === 1 ? 'movimiento' : 'movimientos'} sin categoría, `,
          `agrupados en ${grupos.length} ${grupos.length === 1 ? 'comercio' : 'comercios'}.`),
        h('div.small.mut', { style: { marginTop: '7px', lineHeight: '1.5' } },
          'Cada uno que resuelvas queda aprendido: la próxima vez ese comercio ',
          'ya viene con su categoría.')),

      seguras.length ? h('button.btn', { style: { marginTop: '14px' },
        onclick: () => aceptarTodas(seguras) },
        icono('check', 17),
        `Aceptar ${seguras.length} ${seguras.length === 1 ? 'sugerencia' : 'sugerencias'} seguras`) : null,

      h('div', { style: { marginTop: '16px' } },
        h('div.ghead', 'Por comercio'),
        h('div.grp', grupos.map(fila)))));
  };

  const fila = g => h('button.li', { style: { alignItems: 'flex-start' },
                                     onclick: () => elegir(g) },
    h('div', { class: 'av' + (g.sugerida ? '' : ' amb'), style: { marginTop: '2px' } },
      icono(g.sugerida ? iconoDeCategoria(cats.find(c => c.id === g.sugerida) || {}) : 'varios', 17)),
    h('div.m',
      h('div.t', g.nombre),
      h('div.s', { style: { whiteSpace: 'normal', lineHeight: '1.45' } },
        `${g.cuantos} ${g.cuantos === 1 ? 'movimiento' : 'movimientos'} · último ${dia(g.ultimo)}`,
        // El motivo de la sugerencia, siempre. Una adivinanza por el nombre no
        // puede leerse igual que una regla que escribiste vos.
        g.sugerida ? h('div', { style: { marginTop: '3px', color: g.seguro ? 'var(--pos)' : 'var(--tx3)' } },
          `${nombreDe('categories', g.sugerida)} · ${g.porQue}`) : null)),
    h('div.v', plata(Math.round(g.total))),
    h('span.chev', icono('chev', 15)));

  /** La hoja para elegir, con la sugerida arriba y marcada. */
  function elegir(g) {
    const cerrar = hoja(g.nombre, h('div',
      h('div.small.mut', { style: { lineHeight: '1.55', marginBottom: '14px' } },
        `${g.cuantos} ${g.cuantos === 1 ? 'movimiento' : 'movimientos'} por `,
        h('b', plata(Math.round(g.total))), '. Lo que elijas vale para todos, ',
        'y para los que vengan después.'),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '7px' } },
        ...cats.map(c => h('button', {
          class: 'chip' + (c.id === g.sugerida ? ' sel' : ''),
          onclick: async () => { cerrar(); await aplicar(g, c.id); }
        }, c.nombre)))));
  }

  /** Ponerle la categoría a todo el grupo, y aprenderla. */
  async function aplicar(g, catId) {
    await guardarVarios('transactions', g.txs.map(t => ({ ...t, category_id: catId })));

    // Aprender solo si no choca con una regla que ya diga otra cosa. Cambiarla
    // en silencio movería otros comercios que nadie nombró.
    const choca = reglaQueChoca(g.nombre, catId, state.reglas);
    if (!choca) {
      const r = comoRegla(g.nombre, catId, state.reglas);
      if (r) await guardar('reglas', r);
    }
    aviso(`${g.cuantos} en ${nombreDe('categories', catId)}` +
          (choca ? '' : ' · aprendido'));
    pintar();
  }

  async function aceptarTodas(grupos) {
    const filas = [];
    for (const g of grupos) for (const t of g.txs) filas.push({ ...t, category_id: g.sugerida });
    await guardarVarios('transactions', filas);
    for (const g of grupos) {
      if (reglaQueChoca(g.nombre, g.sugerida, state.reglas)) continue;
      const r = comoRegla(g.nombre, g.sugerida, state.reglas);
      if (r) await guardar('reglas', r);
    }
    aviso(`${filas.length} categorizados`);
    pintar();
  }

  pintar();
}
