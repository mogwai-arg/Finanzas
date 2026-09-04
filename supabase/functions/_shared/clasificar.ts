// =====================================================================
// clasificar.ts — qué hace la app con cada mail.
//
// Existe porque la pantalla de "qué encuentro en tu correo" mentía. Decía
// "descartado · no dice que algo ya pasó" de correos que en realidad SÍ se
// procesan, solo que por otro camino: el resumen de la tarjeta, el aviso de
// que está el de la cuenta. La pantalla miraba un solo camino de cuatro.
//
// Y mentía porque la decisión estaba escrita dos veces. Ahora está una sola y
// las dos la usan: la sincronización para actuar y el diagnóstico para
// contarlo. Si cambia una, cambian las dos.
//
// El diagnóstico es lo que convierte "no entra nada" en algo que se puede
// arreglar, así que tiene que decir la verdad más que ninguna otra pantalla.
// =====================================================================
import { ES_RUIDO, ES_CONSUMO } from './parsers.ts';

export const ES_RESUMEN = /resumen|estado de cuenta|liquidacion|liquidación|tu cuenta|cierre/i;
export const ES_EXTRACTO = /resumen de cuenta|extracto de cuenta|resumen de tu cuenta|movimientos de tu cuenta/i;
export const ES_TARJETA = /tarjeta|visa|mastercard|master\b|amex|cr[eé]dito/i;

// Los avisos de vencimiento no se cargan y está bien: la app calcula sola
// cuándo vence cada tarjeta, desde el ciclo. Pero decir "descartado" de algo
// que uno sabe importante hace dudar de todo el resto.
export const ES_VENCIMIENTO =
  /vencimiento|vence (hoy|mañana|el)|pr[oó]ximo vencimiento|recordatorio de pago|no te olvides de pagar/i;

export type Via = 'movimiento' | 'resumen' | 'extracto' | 'vencimiento' | 'ruido' | 'nada';

/**
 * Qué camino toma un mail, y por qué.
 *
 * El orden importa y no es arbitrario: primero lo que se descarta seguro,
 * después los documentos —que son más específicos y más valiosos que un
 * consumo suelto— y al final el consumo, que es el caso común.
 *
 * El resumen de CUENTA se mira antes que el de tarjeta porque "Resumen de
 * Cuenta VISA" dice las dos cosas, y ahí manda la tarjeta: ese trae consumos.
 */
export function queHagoCon(asunto: string, remitente: string, cuerpo = '') {
  const enTitulo = `${asunto} ${remitente}`;
  const todo = `${asunto} ${cuerpo}`.slice(0, 900);

  // El vencimiento se mira ANTES que el ruido, y a propósito. "Recordatorio de
  // pago" y "vence el" están en la lista de ruido para que no se carguen como
  // gasto —eso está bien— pero entonces tres de cada cuatro avisos de
  // vencimiento se explicaban como "publicidad", que es falso. Con las dos el
  // mail termina igual: no se carga. Lo que cambia es si la explicación es
  // cierta.
  if (ES_VENCIMIENTO.test(todo)) {
    return { via: 'vencimiento' as Via,
             porQue: 'los vencimientos los calculo solo, del ciclo de cada tarjeta' };
  }

  if (ES_RUIDO.test(todo)) {
    return { via: 'ruido' as Via, porQue: 'parece publicidad o una invitación a comprar' };
  }
  if (ES_RESUMEN.test(enTitulo) && ES_TARJETA.test(enTitulo)) {
    return { via: 'resumen' as Via, porQue: 'es el resumen de una tarjeta' };
  }

  if (ES_EXTRACTO.test(asunto) && !ES_TARJETA.test(asunto)) {
    return { via: 'extracto' as Via, porQue: 'avisa que está el resumen de la cuenta' };
  }

  if (!ES_CONSUMO.test(todo)) {
    return { via: 'nada' as Via, porQue: 'no dice que algo ya pasó' };
  }

  return { via: 'movimiento' as Via, porQue: 'cuenta una operación' };
}
