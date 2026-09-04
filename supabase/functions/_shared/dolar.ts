// =====================================================================
// dolar.ts — leer la cotización de servicios que la dan distinto.
//
// Va aparte de la función para poder probarlo: cada servicio devuelve otra
// forma, y el día que uno cambie el formato quiero que lo diga una prueba y
// no la pantalla de "Dónde está la plata" con un total mal.
// =====================================================================

/**
 * Un número que puede ser una cotización.
 *
 * Un dólar a cero o a un millón es un error de lectura, no una cotización, y
 * con eso adentro el total de tu plata se va a cualquier lado. Mejor no
 * contestar que contestar un disparate.
 */
export const cotizacion = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 100 && n < 100_000 ? Math.round(n * 100) / 100 : null;
};

/**
 * El MEP de lo que haya contestado cada servicio.
 *
 * El que importa es el MEP y no el blue: es el que se consigue de verdad,
 * comprando y vendiendo bonos desde el homebanking, sin ir a ningún lado.
 *
 * Se toma la VENTA, que es a lo que uno compra: es el número con el que hay
 * que valuar en pesos lo que tenés en dólares.
 */
export function leerDolar(d: any): { mep: number; blue: number | null } | null {
  // dolarapi: una lista de { casa, nombre, compra, venta }.
  if (Array.isArray(d)) {
    const cual = (re: RegExp) => d.find((x: any) =>
      re.test(String(x?.casa ?? '')) || re.test(String(x?.nombre ?? '')));
    const mep = cual(/bolsa|mep/i), blue = cual(/blue/i);
    const v = cotizacion(mep?.venta) ?? cotizacion(mep?.compra);
    return v ? { mep: v, blue: cotizacion(blue?.venta) } : null;
  }
  // criptoya: { mep: { al30: { ci: { price } } }, blue: { ask } }.
  if (d && typeof d === 'object') {
    const v = cotizacion(d?.mep?.al30?.ci?.price)
           ?? cotizacion(d?.mep?.al30?.['24hs']?.price)
           ?? cotizacion(d?.mep?.ci?.price)
           ?? cotizacion(d?.mep?.price)
           ?? cotizacion(d?.mep);
    return v ? { mep: v, blue: cotizacion(d?.blue?.ask) ?? cotizacion(d?.blue?.price)
                             ?? cotizacion(d?.blue) } : null;
  }
  return null;
}
