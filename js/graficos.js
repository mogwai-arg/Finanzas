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

/**
 * La torta —dona— de en qué se fue la plata.
 *
 * Es la unica forma redonda que hay en la app, y esta acá porque contesta una
 * pregunta que las barras no contestan: no "cuál es el más grande" —eso lo
 * dicen mejor las barras, y por eso siguen estando arriba— sino QUÉ PARTE DEL
 * TODO se lleva cada cosa. "El supermercado es casi la mitad" es un hecho
 * distinto de "el supermercado es el más grande", y es el que hace cambiar
 * algo.
 *
 * Las reglas que la hacen legible, que son las mismas de siempre aplicadas a
 * otra forma:
 *
 *   · Seis gajos como máximo. Del sexto en adelante el ojo ya no distingue
 *     ángulos parecidos, así que la cola se pliega en "otras" —y "otras" es
 *     gris, porque no es una categoría más sino la ausencia de detalle—.
 *   · Los cinco colores son fijos y validados, en claro y en oscuro, contra
 *     la superficie y entre sí para daltonismo. El sexto NO es un color
 *     nuevo generado: eso es lo que rompe cualquier paleta.
 *   · Cada gajo lleva su nombre y su porcentaje escritos al lado. Un gajo
 *     que hay que medir con la vista no sirve para decidir, y ademas los
 *     tonos claros no llegan a 3:1 contra el blanco: la etiqueta no es un
 *     adorno, es lo que los hace accesibles.
 *   · Dos píxeles de aire entre gajos, del color de la tarjeta, para que dos
 *     colores contiguos no se lean como uno solo.
 */
export function tortaDeCategorias(datos, { moneda = 'ARS', alGajo, tope = 5 } = {}) {
  const limpios = datos.filter(d => d.monto > 0);
  if (limpios.length < 2) return null;

  const orden = [...limpios].sort((a, b) => b.monto - a.monto);
  // "Sin categoría" va gris y NO gasta un color de la paleta: no es una
  // categoría más, es la ausencia de una. Pintarla de azul la hace competir
  // con las de verdad, y encima suele ser la más grande —que es justamente el
  // problema que hay que ver, no un rubro del que uno esté orgulloso—.
  let slot = 0;
  const gajos = orden.slice(0, tope).map(d => ({
    ...d,
    color: d.id === null || d.id === undefined
      ? 'var(--cat-otras)' : `var(--cat-${Math.min(5, ++slot)})`
  }));
  const cola = orden.slice(tope);
  if (cola.length) {
    gajos.push({ etiqueta: cola.length === 1 ? cola[0].etiqueta : `Otras ${cola.length}`,
                 monto: cola.reduce((s, d) => s + d.monto, 0),
                 color: 'var(--cat-otras)', esCola: true,
                 detalle: cola.map(d => d.etiqueta).join(', ') });
  }
  const total = gajos.reduce((s, d) => s + d.monto, 0);
  if (!(total > 0)) return null;

  // Dona hecha con un circulo por gajo y trazo discontinuo. Sin matematica de
  // arcos y sin librerias: la vuelta entera es la circunferencia, y cada gajo
  // pinta su parte y deja el resto en blanco.
  const R = 54, GROSOR = 22, C = 2 * Math.PI * R;
  const svg = svgEl('svg', { viewBox: '0 0 140 140', width: '140', height: '140',
                             role: 'img', 'aria-label': 'Reparto de los gastos por categoría' });
  let girado = 0;
  const arcos = [];

  for (const g of gajos) {
    const parte = g.monto / total;
    // El aire entre gajos se descuenta del largo, no se agrega: si se agregara
    // la vuelta pasaria de 360 y el ultimo gajo montaria sobre el primero.
    const largo = Math.max(0, parte * C - 2);
    const arco = svgEl('circle', {
      cx: 70, cy: 70, r: R, fill: 'none', stroke: g.color, 'stroke-width': GROSOR,
      'stroke-dasharray': `${largo} ${C - largo}`,
      // -90 para arrancar arriba, que es de donde la gente lee un reloj.
      transform: `rotate(${girado * 360 - 90} 70 70)`,
      style: 'transition:opacity 140ms'
    });
    arcos.push({ arco, g });
    svg.append(arco);
    girado += parte;
  }

  // El centro lleva la categoría de verdad más grande. Si la más grande es
  // "sin categoría", poner ESO como titular no dice nada de en qué se fue la
  // plata: dice que falta trabajo, y para eso ya está el botón de abajo.
  const mayor = gajos.find(g => g.id != null && !g.esCola) || gajos[0];
  const centro = h('div', { style: { position: 'absolute', inset: '0', display: 'flex',
                                     flexDirection: 'column', alignItems: 'center',
                                     justifyContent: 'center', pointerEvents: 'none' } },
    h('div', { class: 'tabnum', style: { fontSize: '21px', fontWeight: '700',
                                         letterSpacing: '-.03em' } },
      `${Math.round((mayor.monto / total) * 100)} %`),
    h('div.small.mut', { style: { marginTop: '1px', maxWidth: '82px', textAlign: 'center',
                                  lineHeight: '1.2' } }, mayor.etiqueta));

  // Apagar los demas al tocar uno: es lo que deja ver un gajo chico sin tener
  // que buscarlo entre los grandes.
  const resaltar = cual => arcos.forEach(({ arco, g }) => {
    arco.style.opacity = !cual || g === cual ? '1' : '.28';
  });

  const leyenda = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px',
                                      flex: '1', minWidth: '0' } },
    gajos.map(g => h('button', {
      title: g.detalle || g.etiqueta,
      onclick: () => { if (!g.esCola && alGajo) alGajo(g); },
      onpointerenter: () => resaltar(g),
      onpointerleave: () => resaltar(null),
      style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
               background: 'none', border: '0', padding: '6px 2px', cursor: 'pointer',
               textAlign: 'left', minWidth: '0' }
    },
      h('span', { style: { flex: 'none', width: '10px', height: '10px', borderRadius: '3px',
                           background: g.color } }),
      h('span', { style: { flex: '1', minWidth: '0', fontSize: '13.5px',
                           overflow: 'hidden', textOverflow: 'ellipsis',
                           whiteSpace: 'nowrap', color: 'var(--tx)' } }, g.etiqueta),
      h('span.tabnum', { style: { flex: 'none', fontSize: '13px', color: 'var(--tx2)' } },
        `${Math.round((g.monto / total) * 100)} %`))));

  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
    h('div', { style: { position: 'relative', flex: 'none', width: '140px', height: '140px' } },
      svg, centro),
    leyenda);
}
