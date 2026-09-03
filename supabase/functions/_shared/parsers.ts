// =====================================================================
// parsers.ts — convierte avisos de compra (mail o API) en movimientos.
// Cada regla es independiente: agregar un banco nuevo es agregar un objeto.
// =====================================================================

export type Movimiento = {
  monto: number;
  moneda: 'ARS' | 'USD';
  comercio: string;
  fecha: string;          // YYYY-MM-DD
  ultimos4?: string | null;
  cuotas: number;
  medio?: string | null;  // 'credito' | 'debito' | 'billetera'
  emisor: string;         // galicia | modo | mercadopago | personalpay
  confianza: number;      // 0-100
  tipo: 'gasto' | 'ingreso';
};

/** "$ 12.345,67" | "ARS 12.345,67" | "12345.67" -> 12345.67 */
export function plata(s: string): number {
  if (!s) return NaN;
  let t = s.replace(/[^\d.,-]/g, '').trim();
  if (t.includes(',') && t.includes('.')) {
    // formato argentino: el punto es miles, la coma decimales
    t = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (/\.\d{3}$/.test(t) && !/\.\d{1,2}$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  return Number(t);
}

export function limpiar(s: string): string {
  return (s || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'*.-]+|[\s"'*.-]+$/g, '')
    .trim()
    .slice(0, 80);
}

/** Fecha "12/09/2026" o "12-09-26" -> ISO. Si no hay, usa el fallback. */
export function fechaAR(s: string | undefined, fallback: string): string {
  if (!s) return fallback;
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return fallback;
  const [, d, mo, y] = m;
  const yy = y.length === 2 ? '20' + y : y;
  return `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const MONEDA = (t: string): 'ARS' | 'USD' =>
  /u\$s|usd|d[oó]lar/i.test(t) ? 'USD' : 'ARS';

type Regla = {
  emisor: string;
  remitentes: RegExp;
  test: RegExp;
  extraer: (texto: string, hoy: string) => Movimiento | null;
};

// ---------------------------------------------------------------------
// REGLAS
// ---------------------------------------------------------------------
export const REGLAS: Regla[] = [
  // ---------------- Banco Galicia: consumo con tarjeta ----------------
  {
    emisor: 'galicia',
    remitentes: /galicia|bancogalicia/i,
    test: /(compra|consumo|pago).{0,40}(tarjeta|cr[eé]dito|d[eé]bito)|realizaste (una )?(compra|consumo)/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:por|de)\s*(?:\$|ars|u\$s|usd)\s*([\d.,]+)/i)
                 || t.match(/(?:\$|u\$s)\s*([\d.,]+)/i);
      if (!monto) return null;
      const com = t.match(/\ben\s+([A-ZÁÉÍÓÚÑ0-9][^.,\n]{2,60}?)(?=\s+(?:con|el|los|por|el d[ií]a|\.|,|$))/)
               || t.match(/comercio:?\s*([^\n,.]{2,60})/i);
      const u4 = t.match(/terminad[ao]\s*(?:en)?\s*(\d{4})/i) || t.match(/\*{2,}\s*(\d{4})/);
      const cuo = t.match(/(\d{1,2})\s*cuotas?/i);
      return {
        monto: plata(monto[1]), moneda: MONEDA(t),
        comercio: limpiar(com?.[1] || 'Consumo Galicia'),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: u4?.[1] || null,
        cuotas: cuo ? Number(cuo[1]) : 1,
        medio: /d[eé]bito/i.test(t) ? 'debito' : 'credito',
        emisor: 'galicia', confianza: com ? 90 : 65, tipo: 'gasto'
      };
    }
  },
  // ---------------- Banco Galicia: plata que entra o sale de la cuenta ----
  //
  // Va despues de la regla de tarjetas a proposito: una compra con tarjeta
  // tambien nombra al banco, y ahi manda la otra.
  {
    emisor: 'galicia',
    remitentes: /galicia|bancogalicia/i,
    test: /transferencia|dep[oó]sito|acreditaci[oó]n|se acredit[oó]|se debit[oó]|d[eé]bito autom[aá]tico|haberes/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:por|de)\s*(?:\$|ars|u\$s|usd)\s*([\d.,]+)/i)
                 || t.match(/(?:\$|u\$s)\s*([\d.,]+)/i);
      if (!monto) return null;

      const entra = /recibiste|se acredit[oó]|acreditaci[oó]n|dep[oó]sito|haberes|ingres[oó]/i.test(t);
      const sale  = /enviaste|se debit[oó]|d[eé]bito autom[aá]tico|transferencia enviada/i.test(t);
      // Sin saber para que lado va, no es un movimiento: es un aviso suelto.
      if (entra === sale) return null;

      // Quien manda o quien cobra, si el aviso lo dice.
      const quien = t.match(/(?:de|a)\s+([A-ZÁÉÍÓÚÑ][^\n.,]{2,50}?)(?=\s+(?:por|el|con|\.|,|$))/);
      const concepto = /haberes/i.test(t) ? 'Acreditación de haberes'
        : /d[eé]bito autom[aá]tico/i.test(t) ? 'Débito automático'
        : /dep[oó]sito/i.test(t) ? 'Depósito'
        : entra ? 'Transferencia recibida' : 'Transferencia enviada';

      return {
        monto: plata(monto[1]), moneda: MONEDA(t),
        comercio: limpiar(quien ? `${concepto} · ${quien[1]}` : concepto),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: null, cuotas: 1,
        // 'cuenta' para que caiga en la cuenta bancaria y no en una tarjeta.
        medio: 'cuenta', emisor: 'galicia',
        confianza: quien ? 92 : 85,
        tipo: entra ? 'ingreso' : 'gasto'
      };
    }
  },
  // ---------------- MODO ----------------
  {
    emisor: 'modo',
    remitentes: /modo|playdigital/i,
    test: /pagaste|pago realizado|comprobante de pago|operaci[oó]n realizada/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:\$|ars)\s*([\d.,]+)/i);
      if (!monto) return null;
      const com = t.match(/\ben\s+([^\n.,]{2,60})/i) || t.match(/comercio:?\s*([^\n,.]{2,60})/i);
      const cuo = t.match(/(\d{1,2})\s*cuotas?/i);
      const u4 = t.match(/terminad[ao]\s*(?:en)?\s*(\d{4})/i);
      return {
        monto: plata(monto[1]), moneda: MONEDA(t),
        comercio: limpiar(com?.[1] || 'Pago con MODO'),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: u4?.[1] || null,
        cuotas: cuo ? Number(cuo[1]) : 1,
        medio: 'billetera', emisor: 'modo', confianza: com ? 88 : 60, tipo: 'gasto'
      };
    }
  },
  // ---------------- Mercado Pago ----------------
  {
    emisor: 'mercadopago',
    remitentes: /mercadopago|mercadolibre/i,
    test: /pagaste|compraste|tu pago|comprobante de (pago|compra)/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:\$|ars)\s*([\d.,]+)/i);
      if (!monto) return null;
      const com = t.match(/(?:pagaste|compraste)[^\n]{0,30}?\ben\s+([^\n.,]{2,60})/i)
               || t.match(/\ba\s+([A-ZÁÉÍÓÚÑ][^\n.,]{2,50})/);
      const cuo = t.match(/(\d{1,2})\s*cuotas?/i);
      return {
        monto: plata(monto[1]), moneda: MONEDA(t),
        comercio: limpiar(com?.[1] || 'Mercado Pago'),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: null, cuotas: cuo ? Number(cuo[1]) : 1,
        medio: 'billetera', emisor: 'mercadopago', confianza: com ? 85 : 60, tipo: 'gasto'
      };
    }
  },
  // ---------------- Personal Pay ----------------
  //
  // La billetera de Telecom. Su portal de desarrolladores es para COBRAR
  // —integrar pagos en un comercio— y no tiene forma de que uno lea sus
  // propios movimientos, asi que la unica puerta es el mail que manda por
  // cada operacion. Que es, dicho sea de paso, la misma puerta que ya
  // funciona para Galicia y MODO.
  {
    emisor: 'personalpay',
    remitentes: /personalpay|personal pay|telecom/i,
    test: /pagaste|comprobante|tu pago|realizaste (un|una) (pago|compra|transferencia)|enviaste/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:\$|ars)\s*([\d.,]+)/i);
      if (!monto) return null;
      const com = t.match(/(?:pagaste|compraste|abonaste)[^\n]{0,30}?\ben\s+([^\n.,]{2,60})/i)
               || t.match(/comercio:?\s*([^\n,.]{2,60})/i)
               || t.match(/\ba\s+([A-ZÁÉÍÓÚÑ][^\n.,]{2,50})/);
      const cuo = t.match(/(\d{1,2})\s*cuotas?/i);
      const u4 = t.match(/terminad[ao]\s*(?:en)?\s*(\d{4})/i);
      return {
        monto: plata(monto[1]), moneda: MONEDA(t),
        comercio: limpiar(com?.[1] || 'Personal Pay'),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: u4?.[1] || null,
        cuotas: cuo ? Number(cuo[1]) : 1,
        // Mas bajo que los otros a proposito: es el unico escrito sin tener a
        // la vista un mail de verdad. Con confianza baja entra igual pero cae
        // en Revisar, que es donde se ve si el nombre del comercio salio bien.
        medio: 'billetera', emisor: 'personalpay', confianza: com ? 70 : 45, tipo: 'gasto'
      };
    }
  }
];

/**
 * Lee un aviso de aumento: la prepaga, el colegio, el alquiler.
 *
 * No alcanza con encontrar un importe —esos mails estan llenos de numeros:
 * el anterior, el descuento, el total con recargo—. Se busca el que viene
 * DESPUES de una frase que anuncia el valor nuevo, y se toma el primero: el
 * que sigue a "pasa a" es el que importa, no el mas grande de la pagina.
 */
// Frases que por si solas anuncian un valor nuevo.
const ANUNCIA_FUERTE = /(nuevo valor|nuevo importe|pasar[aá] a ser|pasa a ser|pasa a|se actualiza a|actualizad[oa] a|nueva cuota|queda en)/i;
// Frases que sirven solo si el mail ademas habla de un aumento: 'cuota de
// septiembre' aparece igual en una factura comun.
const ANUNCIA_DEBIL = /(valor de la cuota|cuota de|importe de|abonar[aá]s?|ser[aá] de)/i;
const HABLA_DE_AUMENTO = /aument|ajuste|actualiza|incremento|nuevo valor|nueva cuota/i;
const MES = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i;

export function leerAumento(texto: string): { monto: number; desde: string | null } | null {
  const t = (texto || '').replace(/\s+/g, ' ');

  const fuerte = t.match(ANUNCIA_FUERTE);
  const debil = HABLA_DE_AUMENTO.test(t) ? t.match(ANUNCIA_DEBIL) : null;
  const m = fuerte || debil;
  if (!m || m.index == null) return null;

  // El primer importe DESPUES del anuncio, en una ventana corta. Estos mails
  // estan llenos de numeros —el valor anterior, el descuento por pago en
  // termino, el total con recargo— y el que importa es el que sigue a la
  // frase que anuncia el cambio, no el mas grande de la pagina.
  const cerca = t.slice(m.index, m.index + 160);
  // El patron es exacto a proposito: con [\d.]+ el punto final de la oracion
  // quedaba adentro del importe —'259.000.'— y eso no es un numero.
  const imp = cerca.match(/(?:\$|ars)\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
  if (!imp) return null;
  const monto = plata(imp[1]);
  if (!Number.isFinite(monto) || monto <= 0) return null;

  const desde = t.match(new RegExp(`a partir de[^.]{0,20}?${MES.source}`, 'i')) || t.match(MES);
  return { monto, desde: desde ? desde[desde.length - 1].toLowerCase() : null };
}

/** Corre todas las reglas sobre un mail. Devuelve el primer match. */
export function parsearMail(remitente: string, asunto: string, cuerpo: string, hoy: string): Movimiento | null {
  const texto = `${asunto}\n${cuerpo}`.replace(/ /g, ' ');
  for (const r of REGLAS) {
    if (!r.remitentes.test(remitente)) continue;
    if (!r.test.test(texto)) continue;
    try {
      const m = r.extraer(texto, hoy);
      if (m && m.monto > 0 && Number.isFinite(m.monto)) return m;
    } catch (_) { /* siguiente regla */ }
  }
  return null;
}

/**
 * Descarta lo que no es un consumo.
 *
 * La publicidad de un banco habla de tarjetas, de cuotas y de plata, igual
 * que un aviso de compra. "Comprá con tu tarjeta de crédito en 9 cuotas de
 * $1.000 sin interés" pasaba todos los filtros y entraba como un gasto de mil
 * pesos en nueve cuotas que nadie hizo.
 *
 * La diferencia esta en el modo verbal: un aviso cuenta algo que ya paso
 * ("realizaste"), una promo invita a hacerlo ("comprá", "aprovechá"). Eso, mas
 * el vocabulario tipico de una oferta, alcanza para separarlas.
 */
export const ES_RUIDO = new RegExp([
  // lo que ya estaba
  'newsletter', 'promoci[oó]n', 'beneficio', 'encuesta', 'no responder a este mail',
  'clave', 'token', 'alerta de seguridad', 'resumen disponible', 'vencimiento de tu resumen',
  'vence el', 'pr[oó]ximo vencimiento', 'recordatorio de pago',
  // vocabulario de oferta
  'sin inter[eé]s', 'cuotas fijas', 'hasta \\d+ cuotas', 'descuento', 'reintegro de hasta',
  'ahorr[aá]', '\\d+ *% *(de *)?(off|descuento)', 'promo\\b', 'promos\\b', 'sorteo',
  'suscrib[ií]', 'te regalamos', 'exclusivo para', 'v[aá]lido hasta', 'te esperamos',
  // imperativos: la publicidad invita, el aviso informa
  'compr[aá]\\b', 'aprovech[aá]', 'disfrut[aá]', 'llevate', 'conoc[eé]\\b',
  'enterate', 'descubr[ií]', 'pod[eé]s comprar', 'ingres[aá] a'
].join('|'), 'i');

/**
 * Lo contrario del ruido: la marca de que algo YA paso. Sin una de estas, un
 * mail no se toma como consumo por mas que hable de tarjetas y de plata.
 */
export const ES_CONSUMO = new RegExp([
  'realizaste', 'realizaste un consumo', 'se realiz[oó]', 'hiciste (una )?compra',
  'compra realizada', 'consumo realizado', 'aviso de consumo', 'compraste', 'pagaste',
  'aprobad[ao]', 'acreditad[ao]', 'comprobante de (pago|compra)', 'tu pago',
  'operaci[oó]n realizada', 'se debit[oó]', 'se acredit[oó]',
  // Ninguna publicidad dice los ultimos cuatro de tu tarjeta.
  'terminad[ao] *(en)? *\\d{4}', '\\*{2,} *\\d{4}'
].join('|'), 'i');
