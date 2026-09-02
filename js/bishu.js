// =====================================================================
// bishu.js — Bishu, el bicho de la app.
//
// Bishu es quien avisa. No es un adorno: es el tono con el que la app te
// habla cuando no la estás mirando —un aviso en el teléfono— y cuando sí.
// Las reglas de ese tono, para no perderlas:
//
//   · Dice UNA cosa, la que más importa ahora. Nunca una lista.
//   · Habla de plata sin moralizar. Nunca "gastaste mucho", nunca retos.
//   · Cuando algo sale bien, lo dice. Es la mitad del trabajo.
//   · Sin emojis: cambian de dibujo en cada aparato y rompen el registro.
//   · Corto. Si no entra en una notificación, no es de Bishu.
//
// El dibujo es de trazo, como los íconos, y hereda el color de donde esté.
// =====================================================================

const CUERPO = 'M14 15h20a7 7 0 0 1 7 7v10a7 7 0 0 1-7 7H14a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7z';
const OREJAS = 'M15 15.5 11.5 6.5l9.5 5.2M33 15.5l3.5-9-9.5 5.2';
const PATAS = 'M17 39v3.5M31 39v3.5';

// Cada ánimo cambia solo la cara: el cuerpo es siempre el mismo bicho.
const CARAS = {
  contento: { ojos: 'puntos', boca: 'M20.5 30.5q3.5 3.2 7 0' },
  festejo:  { ojos: 'arcos',  boca: 'M19.5 29.5q4.5 5 9 0z' },
  atento:   { ojos: 'puntos', boca: 'M21 31h6' },
  // Ondita y no boca para abajo: Bishu avisa, no reta.
  alerta:   { ojos: 'puntos', boca: 'M20.8 30.8q1.6-1.5 3.2 0t3.2 0' },
  dormido:  { ojos: 'cerrados', boca: 'M22 31h4' }
};

const svgEl = (t, attrs) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', t);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

/** El dibujo de Bishu, del tamaño que se pida. */
export function bishu(animo = 'contento', tam = 44) {
  const cara = CARAS[animo] || CARAS.contento;
  const svg = svgEl('svg', { viewBox: '0 0 48 48', width: tam, height: tam,
                             fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9',
                             'stroke-linecap': 'round', 'stroke-linejoin': 'round',
                             'aria-hidden': 'true' });
  svg.append(svgEl('path', { d: OREJAS }), svgEl('path', { d: CUERPO }), svgEl('path', { d: PATAS }));

  if (cara.ojos === 'puntos') {
    for (const x of [19, 29])
      svg.append(svgEl('circle', { cx: String(x), cy: '25', r: '1.7',
                                   fill: 'currentColor', stroke: 'none' }));
  } else if (cara.ojos === 'arcos') {
    svg.append(svgEl('path', { d: 'M17.2 25.6q1.8-2.4 3.6 0M27.2 25.6q1.8-2.4 3.6 0' }));
  } else {
    svg.append(svgEl('path', { d: 'M17.2 25q1.8 2 3.6 0M27.2 25q1.8 2 3.6 0' }));
  }
  svg.append(svgEl('path', { d: cara.boca }));
  return svg;
}

// =====================================================================
// LO QUE DICE
// =====================================================================
const plata = n => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  .format(Math.abs(Math.round(Number(n) || 0)));

/**
 * La única cosa que Bishu tiene para decir ahora, elegida por urgencia.
 *
 * Es una función pura a propósito: lo que dice se prueba, no se mira. Y no
 * repite lo que la pantalla ya muestra al lado —cuánto va gastado, qué vence—
 * porque un cartel que dice lo mismo que el de arriba es ruido.
 */
export function queDiceBishu(d, hoy = new Date()) {
  const dia = hoy.getDate();

  // 1. La app vive de que le cuenten los gastos. Tres días en silencio es la
  //    diferencia entre un mes que cierra y uno que no.
  if (d.diasSinCargar != null && d.diasSinCargar >= 3) {
    return { animo: 'atento',
             texto: `Hace ${d.diasSinCargar} días que no cargás nada. ¿Quedó algo suelto?` };
  }

  // 2. Contra el mes pasado al mismo día, que es la única comparación que
  //    contesta "¿voy gastando más o menos que la vez pasada?".
  const antes = Number(d.gastadoMesPasadoAlDia) || 0;
  const ahora = Number(d.gastadoEsteMesAlDia) || 0;
  if (antes > 0 && ahora > 0 && dia >= 5) {
    const dif = ahora - antes;
    const pct = Math.abs(dif) / antes;
    if (pct >= 0.08 && Math.abs(dif) >= 1000) {
      return dif < 0
        ? { animo: 'festejo',
            texto: `Vas $ ${plata(dif)} menos que el mes pasado a esta altura. Bien ahí.` }
        : { animo: 'alerta',
            texto: `Vas $ ${plata(dif)} más que el mes pasado a esta altura.` };
    }
    return { animo: 'contento', texto: 'Vas casi igual que el mes pasado a esta altura.' };
  }

  // 3. Recién arrancado el mes todavía no hay con qué comparar.
  if (d.cargoHoy) return { animo: 'contento', texto: 'Ya está todo cargado por hoy.' };
  if (dia <= 4) return { animo: 'contento', texto: 'Arranca el mes. Cargá lo de hoy y yo llevo la cuenta.' };
  return { animo: 'dormido', texto: 'Por acá tranquilo. Cargá lo que gastes y te aviso si algo se desvía.' };
}
