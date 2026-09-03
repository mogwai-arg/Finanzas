// =====================================================================
// duplicados.ts — el mismo movimiento entrando por dos puertas.
//
// Un pago de Mercado Pago puede llegar dos veces: por el mail que MP manda y
// por su propia API. Son dos caminos distintos, con identificadores distintos,
// y para la base son dos filas: el mes queda inflado justo cuando uno empieza
// a confiar en el número.
//
// Tener las dos puertas abiertas igual vale la pena —una tapa lo que la otra
// no ve— pero entonces hay que saber reconocer cuándo dicen lo mismo.
//
// Se compara importe, fecha y moneda; nunca el texto. El mail dice
// "Le pagaste a COTO CICSA" y la API dice "Pago QR", y son el mismo pago.
// =====================================================================

export type Candidato = {
  id?: string; fecha: string; monto: number | string; moneda?: string;
  tipo?: string; account_id?: string | null; fuente?: string;
};

/**
 * ¿Es el mismo movimiento?
 *
 * La fecha con margen porque cada puerta la fecha distinto: MP usa la fecha
 * de acreditación y el mail sale cuando sale. El importe casi exacto —un peso
 * de diferencia es redondeo, no otro pago—.
 *
 * La cuenta solo descarta si las DOS la tienen y son distintas: una fila sin
 * cuenta no contradice a nadie.
 */
export function elMismo(a: Candidato, b: Candidato,
                        { dias = 3, pesos = 1 } = {}): boolean {
  if ((a.tipo || 'gasto') !== (b.tipo || 'gasto')) return false;
  if ((a.moneda || 'ARS') !== (b.moneda || 'ARS')) return false;
  if (Math.abs(Number(a.monto) - Number(b.monto)) > pesos) return false;
  if (a.account_id && b.account_id && a.account_id !== b.account_id) return false;
  const d = Math.abs(
    (Date.parse(String(a.fecha).slice(0, 10)) - Date.parse(String(b.fecha).slice(0, 10))) / 86400000);
  return Number.isFinite(d) && d <= dias;
}

/** El primero de la lista que sea el mismo, o null. */
export function yaEstaba(fila: Candidato, previos: Candidato[] = [],
                         opciones = {}): Candidato | null {
  return previos.find(p => elMismo(fila, p, opciones)) ?? null;
}

/**
 * Qué le agrega la API a lo que ya había.
 *
 * Mercado Pago sabe cosas que el mail no dice —las cuotas, el identificador
 * de la operación— y esas se completan. Lo que la persona tocó no se pisa:
 * la categoría que puso y el hecho de que ya lo revisó son suyos, y una
 * sincronización que los deshace es peor que no sincronizar.
 */
export function loQueSuma(previo: any, nuevo: any): Record<string, unknown> | null {
  const cambios: Record<string, unknown> = {};
  if (!previo.account_id && nuevo.account_id) cambios.account_id = nuevo.account_id;
  if ((!previo.cuotas || previo.cuotas === 1) && nuevo.cuotas > 1) cambios.cuotas = nuevo.cuotas;
  if (!previo.category_id && nuevo.category_id) cambios.category_id = nuevo.category_id;
  // El identificador de MP hace que la próxima vez ni haga falta compararlo.
  if (nuevo.externo_id && previo.externo_id !== nuevo.externo_id) {
    cambios.externo_id = nuevo.externo_id;
    cambios.fuente = 'mercadopago';
  }
  return Object.keys(cambios).length ? cambios : null;
}
