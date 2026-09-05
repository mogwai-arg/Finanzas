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

/** '25 % de descuento con MODO', sin repetir lo que ya dice el título. */
const detalle = p => [
  `${Number(p.valor) || 0} % de ${p.tipo || 'descuento'}`,
  p.medio ? `con ${p.medio}` : null
].filter(Boolean).join(' ') + '.';

/**
 * Todo lo que Bishu tiene para decir, de lo más urgente a lo más opinable.
 *
 * Devuelve una lista y no una frase para que se pueda tocar y seguir: la
 * primera es la que importa, pero cuando el mes viene tranquilo lo segundo y
 * lo tercero son justo lo que uno no sabe que quiere saber.
 *
 * Es una función pura a propósito: lo que dice se prueba, no se mira. Y no
 * repite lo que la pantalla ya muestra al lado —cuánto va gastado, qué vence,
 * cuántos movimientos hay sin revisar— porque un cartel que dice lo mismo que
 * el de arriba es ruido.
 */
export function frasesDeBishu(d, hoy = new Date()) {
  const dia = hoy.getDate();
  const out = [];
  // `k` identifica de QUÉ habla la frase, y `valor` cómo venía eso cuando la
  // dijo. Es lo único que hace falta para acordarse: sin el qué no se puede
  // seguir nada, y sin el cómo venía no se puede decir si mejoró.
  const decir = (animo, texto, ir, k = null, valor = null) =>
    out.push({ animo, texto, ir, k, valor });

  const dichos = (d.memoria && d.memoria.dichos) || [];
  const recordar = k => dichos.filter(x => x.k === k)
    .sort((a, b) => (a.cuando < b.cuando ? 1 : -1))[0] || null;
  const diasDesde = x => x && x.cuando
    ? Math.round((hoy - new Date(x.cuando)) / 86400000) : null;

  // ------------------------------------------------------ lo que ya dije
  //
  // Va primero, antes que cualquier novedad, y es todo el punto de tener
  // memoria: una app que solo señala lo que está mal es una app que solo
  // trae malas noticias. Decir "esto que te marqué la semana pasada mejoró"
  // es lo único que convierte un señalamiento en algo que sirvió.
  seguimiento(d, decir, recordar, diasDesde);

  // 1. Una promo que aplica hoy vence hoy: no hay nada que pueda esperar
  //    menos. Va antes que todo lo demás, y por eso no hace falta una
  //    sección de promos aparte repitiendo lo mismo dos renglones más arriba.
  const hoyMismo = (d.promos || []).find(x => x.dias === 0);
  if (hoyMismo) decir('festejo', `Hoy es la de ${hoyMismo.titulo}. ${detalle(hoyMismo)}`, '/promos');

  // 2. La app vive de que le cuenten los gastos. Tres días en silencio es la
  //    diferencia entre un mes que cierra y uno que no.
  if (d.diasSinCargar != null && d.diasSinCargar >= 3)
    decir('atento', `Hace ${d.diasSinCargar} días que no cargás nada. ¿Quedó algo suelto?`);

  // 3. Un tope pasado es plata que ya se fue, y el nombre de la categoría es
  //    lo único que hace que la próxima vez uno se acuerde.
  if (d.excedida)
    decir('alerta', `${d.excedida.nombre} se pasó $ ${plata(d.excedida.exceso)} del tope.`,
          '/mes', `tope:${d.excedida.id || d.excedida.nombre}`, d.excedida.exceso);

  // 4. Lo que ya está comprometido en un mes que todavía no llegó. Va arriba
  //    porque es lo único que se decide ANTES: cuando el mes llega ya no hay
  //    nada que hacer, y ahí es cuando se vuelve a usar la tarjeta para
  //    llegar, que es el círculo que hay que cortar.
  if (d.aprieta)
    decir('alerta', `En ${d.aprieta.mes} ya tenés comprometido el ${d.aprieta.pct} % de lo ` +
                    `que entra. Te quedarían $ ${plata(d.aprieta.libre)} para todo el mes.`,
          '/estadisticas', `aprieta:${d.aprieta.mes}`, d.aprieta.pct);

  // 5. Un fijo que se despegó del resto es plata sobre la mesa todos los
  //    meses, no una vez: va antes que las comparaciones del mes, aunque no
  //    tenga vencimiento. Y solo se dice si se despegó de LO TUYO: en
  //    Argentina todo sube, avisar por cualquier aumento es no avisar.
  if (d.aumento)
    decir('alerta', `${d.aumento.nombre} subió ${Math.round(d.aumento.subio)} % en tres meses ` +
                    `y el resto de tus fijos ${Math.round(d.aumento.normal)} %. ` +
                    `Son $ ${plata(d.aumento.demas)} de más por mes.`,
          '/mes', `aumento:${d.aumento.nombre}`, Math.round(d.aumento.hasta || 0));

  // 6. El cierre no se puede mover, y comprar un día antes o un día después
  //    cambia en un mes cuándo se paga.
  if (d.cierraManana)
    decir('atento', `${d.cierraManana} cierra mañana. Lo que compres después se paga ` +
                    'el mes siguiente.', '/mes');

  // 7. Contra el mes pasado al mismo día, que es la única comparación que
  //    contesta "¿voy gastando más o menos que la vez pasada?".
  const antes = Number(d.gastadoMesPasadoAlDia) || 0;
  const ahora = Number(d.gastadoEsteMesAlDia) || 0;
  if (antes > 0 && ahora > 0 && dia >= 5) {
    const dif = ahora - antes;
    const pct = Math.abs(dif) / antes;
    if (pct >= 0.08 && Math.abs(dif) >= 1000) {
      decir(dif < 0 ? 'festejo' : 'alerta',
        dif < 0 ? `Vas $ ${plata(dif)} menos que el mes pasado a esta altura. Bien ahí.`
                : `Vas $ ${plata(dif)} más que el mes pasado a esta altura.`,
        '/estadisticas', 'ritmo', Math.round(dif));
    } else {
      decir('contento', 'Vas casi igual que el mes pasado a esta altura.', '/estadisticas');
    }
  }

  // 6. El ahorro es un piso al que llegar, así que se dice lo que falta. Con
  //    el mes corriendo no se festeja: el día 3 la plata libre está arriba de
  //    cualquier meta porque el sueldo entró y los gastos no se hicieron.
  if (d.ahorro && d.ahorro.logrado)
    decir('festejo', 'Llegaste al ahorro que te propusiste este mes.', '/mes');
  else if (d.ahorro && d.ahorro.falta > 0 && !d.ahorro.enCurso)
    decir('atento', `El mes cerró $ ${plata(d.ahorro.falta)} abajo del ahorro que querías.`, '/mes');
  else if (d.ahorro && d.ahorro.enCurso && d.ahorro.referencia != null)
    decir(d.ahorro.ahorrado >= d.ahorro.referencia ? 'contento' : 'atento',
      `Para el ahorro vas $ ${plata(d.ahorro.ahorrado)}; a esta altura del mes ` +
      `pasado ibas $ ${plata(d.ahorro.referencia)}.`, '/mes');

  // 7. Las de una vez al mes son las que uno se pierde, y avisarlas dos días
  //    antes es lo que las hace servir.
  const proxima = (d.promos || []).find(x => x.dias > 0 && x.dias <= 3);
  if (proxima)
    decir('contento', `${proxima.dias === 1 ? 'Mañana' : `El ${proxima.cuando}`} cae la de ` +
                      `${proxima.titulo}. ${detalle(proxima)}`, '/promos');

  // 8. El gasto más grande del mes: es el que uno recuerda y el que puede
  //    decidir no repetir.
  if (d.mayor && d.mayor.monto > 0)
    decir('contento', `Lo más grande del mes fue ${d.mayor.nombre}, ` +
                      `$ ${plata(d.mayor.monto)}.`, '/estadisticas');

  // 9. Y si no hay nada de lo anterior, algo honesto según el momento del mes.
  if (d.cargoHoy) decir('contento', 'Ya está todo cargado por hoy.');
  if (dia <= 4) decir('contento', 'Arranca el mes. Cargá lo de hoy y yo llevo la cuenta.');
  decir('dormido', 'Por acá tranquilo. Cargá lo que gastes y te aviso si algo se desvía.');

  // Lo mismo dos días seguidos deja de leerse. No se borra —sigue estando si
  // uno toca— pero baja al final: lo primero tiene que ser algo que todavía
  // no oíste.
  //
  // Lo dicho HOY no baja: si bajara, la frase cambiaría sola entre una
  // apertura y la siguiente, y lo importante tiene que quedarse hasta que
  // hagas algo con eso. Baja lo de ayer y lo de anteayer.
  const reciente = f => {
    if (!f.k) return false;
    const dd = diasDesde(recordar(f.k));
    return dd != null && dd >= 1 && dd <= 2;
  };
  return [...out.filter(f => !reciente(f)), ...out.filter(reciente)];
}

/**
 * Lo que Bishu marcó antes, y en qué quedó.
 *
 * Sin esto, Bishu solo trae malas noticias: señala lo que está mal y nunca
 * dice que se arregló. Nadie sigue escuchando a alguien así, y el que avisa
 * de todo y no reconoce nada termina apagado.
 *
 * Solo se dice cuando mejoró DE VERDAD y contra lo que había cuando lo dijo,
 * que es el número que quedó guardado. Felicitar por algo que no cambió es
 * peor que no decir nada: la próxima vez ya no se le cree.
 */
function seguimiento(d, decir, recordar, diasDesde) {
  // Una categoría que se había pasado del tope y este mes entra.
  for (const c of d.categorias || []) {
    const x = recordar(`tope:${c.category_id || c.id || c.nombre}`);
    const dd = diasDesde(x);
    if (!x || dd == null || dd < 5 || dd > 45) continue;
    if (c.gastado > c.tope) continue;                    // sigue pasada
    decir('festejo', `${c.nombre} se te había pasado del tope y ahora va dentro. ` +
                     `Llevás $ ${plata(c.gastado)} de $ ${plata(c.tope)}.`,
          '/estadisticas', `logro:tope:${c.category_id || c.id || c.nombre}`);
  }

  // Un fijo que se había despegado y bajó después de que lo dijimos.
  for (const f of d.fijos || []) {
    const x = recordar(`aumento:${f.nombre}`);
    const dd = diasDesde(x);
    if (!x || x.valor == null || dd == null || dd < 20) continue;
    const baja = Number(x.valor) - Number(f.monto || 0);
    if (baja < Math.max(500, Number(x.valor) * 0.03)) continue;
    decir('festejo', `${f.nombre} te lo bajaron: pagás $ ${plata(baja)} menos por mes ` +
                     `que cuando te lo marqué. Son $ ${plata(baja * 12)} en un año.`,
          '/mes', `logro:aumento:${f.nombre}`);
  }

  // Venías gastando más que el mes pasado y diste vuelta el ritmo.
  const x = recordar('ritmo');
  const dd = diasDesde(x);
  if (x && x.valor > 0 && dd != null && dd >= 5 && dd <= 40) {
    const antes = Number(d.gastadoMesPasadoAlDia) || 0;
    const ahora = Number(d.gastadoEsteMesAlDia) || 0;
    const dif = ahora - antes;
    if (antes > 0 && dif < 0) {
      decir('festejo', `Venías gastando más que el mes pasado y lo diste vuelta: ` +
                       `ahora vas $ ${plata(dif)} abajo.`, '/estadisticas', 'logro:ritmo');
    }
  }
}

/**
 * La única cosa que Bishu tiene para decir ahora, elegida por urgencia.
/**
 * La única cosa que Bishu tiene para decir ahora, elegida por urgencia.
 */
export const queDiceBishu = (d, hoy = new Date()) => frasesDeBishu(d, hoy)[0];
