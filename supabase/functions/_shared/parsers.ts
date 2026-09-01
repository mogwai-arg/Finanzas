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
  emisor: string;         // galicia | modo | mercadopago
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
  // ---------------- MODO ----------------
  {
    emisor: 'modo',
    remitentes: /modo|playdigital/i,
    test: /pagaste|pago realizado|comprobante de pago/i,
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
    test: /pagaste|compraste|tu pago|comprobante/i,
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
  }
];

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

/** Descarta avisos que no son consumos (promos, resúmenes, avisos de seguridad). */
export const ES_RUIDO = /newsletter|promoci[oó]n|beneficio|encuesta|no responder a este mail|clave|token|alerta de seguridad|resumen disponible|vencimiento de tu resumen/i;
