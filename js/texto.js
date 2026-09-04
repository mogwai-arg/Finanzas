// =====================================================================
// texto.js — como se nombran las cosas en pantalla.
//
// Va aparte de formato.js porque eso arrastra el estado de la app, y estas
// son funciones puras: entra un movimiento, sale un texto. Asi se pueden
// probar sin navegador.
// =====================================================================

/**
 * Como se titula un movimiento.
 *
 * Son dos datos distintos: QUE compraste ('zapatillas para Feli') y DONDE
 * ('Dexter'). El resumen del banco solo trae el comercio, asi que ahi los dos
 * coinciden y se muestra uno solo.
 */
export function tituloTx(tx) {
  const que = (tx.descripcion || '').trim();
  const donde = (tx.comercio || '').trim();
  return que && que !== donde ? que : (donde || que || 'Movimiento');
}

/** El renglon de abajo: donde fue, si no es ya el titulo. */
export function dondeTx(tx) {
  const que = (tx.descripcion || '').trim();
  const donde = (tx.comercio || '').trim();
  return que && donde && que !== donde ? donde : '';
}

/**
 * Un importe escrito a mano, en numero.
 *
 * En Argentina la coma es el decimal y el punto separa los miles, pero el
 * teclado del telefono no siempre respeta eso: a veces mete un punto donde
 * uno queria una coma. La version anterior borraba todos los puntos y
 * despues cambiaba la coma, asi que '88.23' —que es lo que sale de teclear
 * 88 punto 23— terminaba siendo 8823. Cien veces mas caro, sin aviso.
 *
 * La regla: si hay dos separadores manda el ultimo. Si hay uno solo y lo
 * siguen exactamente dos digitos hasta el final, es un decimal aunque sea un
 * punto. Tres digitos son miles: '1.234' es mil doscientos treinta y cuatro.
 */
export function aNumero(v) {
  let t = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!t) return 0;

  const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');

  if (coma >= 0 && punto >= 0) {
    // El ultimo separa los decimales; el otro es de miles.
    const dec = Math.max(coma, punto);
    t = t.slice(0, dec).replace(/[.,]/g, '') + '.' + t.slice(dec + 1);
  } else if (coma >= 0) {
    // La coma es decimal salvo que separe grupos de tres: '1,234,567'.
    t = /,\d{3}(?:,|$)/.test(t) && !/,\d{1,2}$/.test(t)
      ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (punto >= 0) {
    const finales = t.length - punto - 1;
    // Un solo punto con dos digitos detras es un decimal, aunque acá el punto
    // sea de miles: '88.23' no puede ser ochenta y ocho mil veintitres.
    if (finales === 3 || t.split('.').length > 2) t = t.replace(/\./g, '');
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** $ 612.400 · US$ 4.820. Sin centavos cuando el monto es redondo. */
export function plata(n, moneda = 'ARS', { signo = false } = {}) {
  const p = partes(n, moneda, { signo });
  // Espacios duros y no comunes: en un renglon angosto, "− $ 1.077.538"
  // partia justo despues del menos y el numero caia solo en la linea de
  // abajo, que se lee como un numero positivo.
  return `${p.simbolo}\u00A0${p.numero}`;
}

/** Las piezas de un importe, para poder mostrarlas por separado. */
function partes(n, moneda = 'ARS', { signo = false } = {}) {
  const v = Number(n) || 0;
  const dec = Math.abs(v % 1) > 0.004 ? 2 : 0;
  const numero = new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec,
                                                  maximumFractionDigits: dec }).format(Math.abs(v));
  const sim = moneda === 'USD' ? 'US$' : '$';
  // Cero no sube ni baja: "+ $ 0" se lee como si hubiera entrado algo.
  const sg = signo && v !== 0 ? (v < 0 ? '−' : '+') + '\u00A0' : (v < 0 ? '−' : '');
  // El signo menos es un lugar donde el navegador puede cortar el renglón, y
  // no alcanza con no poner espacio: "−$ 1.077.538" se partía igual, y el
  // número solo en la línea de abajo se lee como si fuera positivo. El
  // juntapalabras prohíbe el corte ahí.
  return { simbolo: sg ? sg + '\u2060' + sim : sim, numero };
}

/** Separa el simbolo para poder mostrarlo mas chico que la cifra. */
export const plataPartida = (n, moneda = 'ARS') => partes(n, moneda);
