// =====================================================================
// pagos.ts — reconocer el pago de un resumen cuando entra solo.
//
// Pagar la tarjeta no es un gasto: el gasto ya se contó el día que hiciste
// cada compra. Es plata que sale de una cuenta y salda la tarjeta, y la app
// lo guarda como una movida con destino a esa tarjeta.
//
// Que la sincronización lo cargara como gasto rompía dos cosas a la vez, y
// las dos son de las que hacen desconfiar del número:
//
//   El resumen seguía figurando impago, porque pagadoDeResumen() solo cuenta
//   movidas con destino a la tarjeta.
//   Y el mes quedaba inflado por el monto del pago, contando dos veces lo
//   mismo: las compras y después el pago de esas compras.
//
// Todo lo demás —lo que se viene, las cuotas futuras, cuánto falta pagar— se
// deriva de las transacciones, así que con la fila bien puesta se acomoda
// solo. La fila mal puesta es la que se propaga.
// =====================================================================

const ES_PAGO = /pago\s*(de\s*)?(tu\s*)?(tarjeta|resumen)|pago\s*(visa|master|mastercard|amex|american)|su pago en pesos|pagaste tu (resumen|tarjeta)|pago de tu (resumen|tarjeta)|cancelaci[oó]n de resumen/i;

export type Cuenta = { id: string; nombre?: string; tipo?: string;
                       ultimos4?: string | null; activo?: boolean };

/**
 * ¿Este movimiento es el pago de alguna de tus tarjetas? Devuelve cuál.
 *
 * Se busca en este orden: los últimos cuatro números, que es lo único
 * inequívoco; después la marca escrita en el texto; y solo si tenés UNA sola
 * tarjeta, esa. Con dos tarjetas y sin ninguna pista no se adivina: mandar el
 * pago a la tarjeta equivocada deja una saldada de más y la otra impaga, que
 * es peor que dejarlo como estaba.
 */
export function esPagoDeTarjeta(texto: string, cuentas: Cuenta[] = []): Cuenta | null {
  const t = String(texto || '');
  if (!ES_PAGO.test(t)) return null;

  const tarjetas = cuentas.filter(c => c.tipo === 'credito' && c.activo !== false);
  if (!tarjetas.length) return null;

  const cuatro = t.match(/\b(?:\*{2,4}\s*)?(\d{4})\b(?!\s*[.,]\d)/g) || [];
  for (const c of tarjetas) {
    if (c.ultimos4 && cuatro.some(x => x.replace(/\D/g, '') === c.ultimos4)) return c;
  }

  for (const c of tarjetas) {
    const marca = String(c.nombre || '').toLowerCase()
      .match(/visa|master(card)?|amex|american/)?.[0];
    if (marca && new RegExp(marca, 'i').test(t)) return c;
  }

  return tarjetas.length === 1 ? tarjetas[0] : null;
}

/**
 * La fila, convertida en movida hacia la tarjeta.
 *
 * El origen es la cuenta de donde salió, que es la que la fila ya traía. Si
 * no la traía se deja en null: una movida sin origen es menos mentira que una
 * con el origen inventado, y en la pantalla se ve y se puede arreglar.
 */
export function comoPagoDeTarjeta(fila: any, tarjeta: Cuenta) {
  return {
    ...fila,
    tipo: 'transferencia',
    destino_account_id: tarjeta.id,
    account_id: fila.account_id ?? null,
    descripcion: `Pago ${tarjeta.nombre ?? 'tarjeta'}`,
    // Una movida no va a ninguna categoría de gasto: la plata sigue siendo
    // tuya, cambió de lugar. Dejarle la categoría la metería en el gráfico de
    // en qué se fue.
    category_id: null,
    cuotas: 1
  };
}
