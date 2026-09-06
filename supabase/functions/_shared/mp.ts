// =====================================================================
// mp.ts — leer un pago de la API de Mercado Pago sin inventar nada.
// =====================================================================

/**
 * Si un pago de Mercado Pago ENTRA o SALE de tu cuenta.
 *
 * Estaba escrito asi:
 *
 *   const esGasto = String(p.payer?.id ?? '') === String(it.cuenta);
 *
 * y ahi hay un agujero: `payer.id` viene VACIO en un monton de pagos —los de
 * QR, los de plata en cuenta, los que MP no atribuye a un usuario—. Vacio no
 * es igual a tu id, asi que "no sos el pagador", asi que INGRESO. Un dato que
 * falta se convertia en plata que entra, que es el peor error que puede
 * cometer esta app: infla lo que entro, infla la plata libre, y son decisiones
 * que se toman con ese numero.
 *
 * Ahora se contesta con lo que se sabe y se admite cuando no se sabe:
 *
 *   · sos el pagador          -> sale
 *   · te pagaron y hay pagador-> entra
 *   · sos las dos puntas      -> es plata tuya moviendose, no cuenta
 *   · no se puede saber       -> 'nose'
 *
 * Y 'nose' se carga como GASTO, no como ingreso. Los dos son adivinar, pero
 * equivocarse para el lado del gasto deja el mes corto —un error que se ve y
 * se corrige— y equivocarse para el otro te hace creer que tenes plata que no
 * tenes. Ademas entra con poca confianza y va a Revisar, donde se da vuelta
 * de un toque.
 */
export function direccion(p: any, cuenta: string): 'entra' | 'sale' | 'propio' | 'nose' {
  const yo = String(cuenta ?? '');
  const pagador = p?.payer?.id == null ? '' : String(p.payer.id);
  const cobrador = p?.collector_id == null ? '' : String(p.collector_id);
  if (!yo) return 'nose';
  if (pagador && cobrador && pagador === yo && cobrador === yo) return 'propio';
  if (pagador && pagador === yo) return 'sale';
  if (cobrador && cobrador === yo && pagador && pagador !== yo) return 'entra';
  return 'nose';
}
