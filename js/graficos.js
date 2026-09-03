// =====================================================================
// graficos.js — dos gráficos, hechos a mano en SVG.
//
// Sin librería a propósito: un gráfico de barras son rectángulos, y traer
// 200 KB para dibujar rectángulos contradice todo lo demás de la app, que
// no baja nada de ningún CDN.
//
// Las reglas que sigue cada uno, que son las que lo hacen legible y no
// lindo:
//
//   · La forma la elige el trabajo del dato. Comparar magnitudes entre
//     categorías es una barra horizontal ordenada, nunca una torta: el ojo
//     compara largos bien y ángulos mal.
//   · Un solo eje. Nunca dos escalas en el mismo gráfico.
//   · Color por lo que significa, no por el orden. Los dos pasos de dato
//     están validados contra la superficie y entre sí, en claro y en oscuro.
//   · El valor va escrito al lado de la barra. Un gráfico que hay que medir
//     con la vista no sirve para decidir.
//   · La grilla desaparece. El dato es lo único con color.
// =====================================================================
import { h } from './ui.js';
import { plata } from './formato.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (t, attrs = {}) => {
  const e = document.createElementNS(NS, t);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
  return e;
};

/**
 * Barras horizontales ordenadas de mayor a menor.
 *
 * `datos` = [{ etiqueta, monto, nota }]. El ancho lo pone el CSS; el alto
 * sale de la cantidad de filas, así nunca hay que hacer scroll dentro del
 * gráfico ni las barras quedan finitas cuando hay muchas.
 */
export function barrasHorizontales(datos, { moneda = 'ARS', alFila } = {}) {
  const max = Math.max(...datos.map(d => d.monto), 1);
  return h('div.gr-barras', datos.map(d => {
    const pct = Math.max(1.5, (d.monto / max) * 100);
    const fila = h(alFila ? 'button.gr-fila' : 'div.gr-fila',
      alFila ? { onclick: () => alFila(d) } : {},
      h('div.gr-tope',
        h('span.gr-et', d.etiqueta),
        h('span.gr-val', plata(Math.round(d.monto), moneda))),
      h('div.gr-pista', h('div.gr-marca', { style: { width: pct + '%' } })),
      d.nota ? h('div.gr-nota', d.nota) : null);
    return fila;
  }));
}

/**
 * Dos series por mes, una al lado de la otra.
 *
 * Agrupadas y no apiladas porque la pregunta es "¿entró más de lo que salió?",
 * y eso se contesta comparando dos alturas contra la misma base. Apiladas se
 * contestaría otra: "¿cuánto suman?", que acá no significa nada.
 *
 * Cada mes es un boton y arranca elegido el que esta en curso. En un telefono
 * no hay hover: sin poder tocar la barra, la unica forma de saber cuanto vale
 * seria medirla con el ojo, y entonces el numero no esta.
 */
export function barrasPorMes(serie, { moneda = 'ARS', alto = 132, alElegir } = {}) {
  const max = Math.max(...serie.flatMap(s => [s.ingresos, s.gastos]), 1);
  let elegido = Math.max(0, serie.findIndex(m => m.enCurso));

  const cols = h('div.gr-meses');
  const pintar = () => {
    cols.replaceChildren(...serie.map((m, i) => {
      const barra = (valor, clase) => h('div', {
        class: `gr-col ${clase}`,
        style: { height: Math.max(valor > 0 ? 2 : 0, (valor / max) * 100) + '%' } });
      return h('button.gr-mes', {
        'aria-pressed': String(i === elegido),
        'aria-label': `${m.nombre}: entró ${plata(Math.round(m.ingresos), moneda)}, ` +
                      `salió ${plata(Math.round(m.gastos), moneda)}`,
        onclick: () => { elegido = i; pintar(); alElegir && alElegir(serie[i]); }
      },
        h('div.gr-par', { style: { height: alto + 'px' } },
          barra(m.ingresos, 'in'), barra(m.gastos, 'out')),
        h('div.gr-mesnom', { class: 'gr-mesnom' + (m.enCurso ? ' hoy' : '') }, m.nombre));
    }));
  };
  pintar();
  if (alElegir) alElegir(serie[elegido]);
  return cols;
}

/** La leyenda: con dos series, la identidad nunca puede ser solo el color. */
export const leyenda = (...pares) =>
  h('div.gr-leyenda', pares.map(([clase, texto]) =>
    h('span.gr-lg', h('i', { class: 'gr-pt ' + clase }), texto)));
