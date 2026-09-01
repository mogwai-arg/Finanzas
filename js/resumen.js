// =====================================================================
// resumen.js — lectura del resumen de tarjeta de Banco Galicia.
// Entra el texto plano del PDF, sale un objeto. Sin DOM, sin red.
//
// Galicia emite DOS formatos distintos para el mismo mes:
//   VISA        fechas 06-06-26, columna CUOTA en la misma fila
//   MASTERCARD  fechas 30-Jul-26, cuotas en una seccion aparte
// Por eso hay dos lectores y un detector.
// =====================================================================

const MESES = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6,
                jul:7, ago:8, sep:9, set:9, oct:10, nov:11, dic:12 };

/** '1.276.838,45' -> 1276838.45 · '-53,72' -> -53.72 */
export function parseMonto(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** '30-Jul-26' y '30-07-26' -> '2026-07-30'. Devuelve null si no es fecha. */
export function parseFecha(s) {
  const m = String(s).trim().match(/^(\d{1,2})[-/]([A-Za-zÁÉÍÓÚáéíóú]{3,}|\d{1,2})[-/](\d{2}|\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  let mes;
  if (/^\d+$/.test(m[2])) mes = Number(m[2]);
  else mes = MESES[m[2].toLowerCase().slice(0, 3)];
  if (!mes || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // Un resumen de tarjeta nunca es de 1900: dos digitos siempre son 20xx.
  const anio = m[3].length === 4 ? Number(m[3]) : 2000 + Number(m[3]);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** 'Setiembre/26' y 'Septiembre-26' -> '2026-09' */
export function parsePeriodo(s) {
  const m = String(s).trim().match(/^([A-Za-zÁÉÍÓÚáéíóú]+)[-/](\d{2}|\d{4})$/);
  if (!m) return null;
  const mes = MESES[m[1].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  const anio = m[2].length === 4 ? Number(m[2]) : 2000 + Number(m[2]);
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

export function detectarEmisor(texto) {
  if (!/Banco Galicia|CUIT Banco: 30-50000173-5|galicia/i.test(texto) &&
      !/Resumen de tarjeta de credito/i.test(texto)) return null;
  if (/MASTERCARD/i.test(texto)) return { emisor: 'galicia', marca: 'mastercard' };
  if (/\bVISA\b/i.test(texto))   return { emisor: 'galicia', marca: 'visa' };
  return null;
}

// ---------------------------------------------------------------------
// CICLO
// ---------------------------------------------------------------------

/**
 * Las seis fechas que el resumen imprime en una sola fila:
 * cierre y vencimiento del periodo anterior, del actual y del proximo.
 *
 * IMPORTANTE: en Galicia el cierre NO cae un dia fijo del mes. En el
 * resumen de agosto/26 los cierres son 30-jul, 27-ago y 1-oct: todos
 * jueves, con el vencimiento el viernes de la semana siguiente, pero
 * separados 28 y 35 dias. Calcular el ciclo con un numero de dia da mal.
 * Por eso se leen del resumen, que ademas publica el ciclo que viene.
 */
export function leerCiclo(texto) {
  const re = /(\d{1,2}-(?:[A-Za-z]{3}|\d{2})-\d{2})/g;
  for (const linea of texto.split('\n')) {
    const f = (linea.match(re) || []).map(parseFecha).filter(Boolean);
    if (f.length === 6 && f.every((d, i) => i === 0 || d > f[i - 1])) {
      return { cierreAnterior: f[0], vencimientoAnterior: f[1],
               cierre: f[2], vencimiento: f[3],
               cierreProximo: f[4], vencimientoProximo: f[5] };
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// LINEAS
// ---------------------------------------------------------------------

const RE_CUOTA_FINAL = /\s(\d{2})\/(\d{2})\s+(\d{4,})\s/;   // NN/MM antes del comprobante
const RE_IMPUESTO = /^(\d{1,2}-(?:[A-Za-z]{3}|\d{2})-\d{2})\s+(DEV\.?IMP\.?\s+)?(.+?)\s+([\d.,]+)\s*%\s*\(\s*([\d.,]+)\s*\)\s+(-?[\d.,]+)/i;

/** Impuestos y percepciones: 'IIBB PERCEP-CABA 2,00%( 23073,36) 461,46' */
function leerImpuesto(linea) {
  const m = linea.match(RE_IMPUESTO);
  if (!m) return null;
  const monto = parseMonto(m[6]);
  const esDev = !!m[2] || monto < 0;
  return { fecha: parseFecha(m[1]), concepto: (m[2] || '').trim() + m[3].trim(),
           alicuota: parseMonto(m[4]), base: parseMonto(m[5]),
           monto: esDev ? -Math.abs(monto) : monto, devolucion: esDev };
}

/**
 * Una linea de consumo. `conCuota` dice si en este formato la cuota puede
 * venir en la misma fila; en Mastercard solo la traen las de su seccion.
 */
function leerConsumo(linea, { conCuota }) {
  const m = linea.match(/^(\d{1,2}-(?:[A-Za-z]{3}|\d{2})-\d{2})\s+(.*)$/);
  if (!m) return null;
  const fecha = parseFecha(m[1]);
  if (!fecha) return null;
  let resto = ' ' + m[2].trimEnd() + ' ';

  // Marca de Visa: un '*' o una 'K' sueltos despues de la fecha.
  let marca = null;
  const mk = resto.match(/^\s([*K])\s/);
  if (mk) { marca = mk[1]; resto = resto.slice(mk[0].length - 1); }

  // El ultimo importe de la fila. Si la descripcion trae 'USD', es dolares.
  const mm = resto.match(/(-?[\d][\d.]*,\d{2})\s*$/);
  if (!mm) return null;
  const importe = parseMonto(mm[1]);
  resto = resto.slice(0, mm.index) + ' ';

  // Comprobante: el ultimo grupo de digitos que queda.
  let comprobante = null;
  const mc = resto.match(/\s(\d{4,})\s*$/);
  if (mc) { comprobante = mc[1]; resto = resto.slice(0, mc.index) + ' '; }

  // Un consumo en dolares repite el importe dentro de la descripcion,
  // precedido por 'USD'. Ojo: a veces viene pegado al comercio
  // ('Microsoft*Xbox G MicrosoftUSD  12,85'), asi que no sirve buscar
  // \bUSD\b — hay que buscar el par 'USD <importe>' al final.
  const enDolares = /USD\s*[\d.]*,\d{2}\s*$/i.test(resto);

  // Cuota: NN/MM pegado al comprobante. Solo donde el formato la admite.
  let cuota = null;
  if (conCuota) {
    const cu = resto.match(/\s(\d{2})\/(\d{2})\s*$/);
    if (cu) {
      cuota = { nro: Number(cu[1]), total: Number(cu[2]) };
      resto = resto.slice(0, cu.index) + ' ';
    }
  }

  const comercio = resto.replace(/\s*USD\s*[\d.,]*\s*$/i, '').replace(/\s+/g, ' ').trim();
  if (!comercio) return null;

  return { fecha, comercio, cuota, comprobante, marca,
           ars: enDolares ? null : importe, usd: enDolares ? importe : null };
}

const esPago = l => /SU PAGO/i.test(l);

// ---------------------------------------------------------------------
// RESUMEN COMPLETO
// ---------------------------------------------------------------------

export function parseResumen(texto) {
  const id = detectarEmisor(texto);
  if (!id) return null;
  const conCuotaEnFila = id.marca === 'visa';

  const out = {
    ...id, ultimos4: null, ciclo: leerCiclo(texto),
    saldoAnterior: { ars: null, usd: null },
    pagos: [], consumos: [], impuestos: [],
    total: { ars: null, usd: null }, pagoMinimo: null, cuotasAVencer: []
  };

  const lineas = texto.split('\n');
  let enCuotasDelMes = false;

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];

    if (/^\s*CUOTA DEL MES\s*$/i.test(l)) { enCuotasDelMes = true; continue; }
    if (/^\s*(SUBTOTAL|TOTAL A PAGAR|COMPRAS DEL MES)/i.test(l)) enCuotasDelMes = false;

    let m;
    if ((m = l.match(/TARJETA\s+(\d{4})\s/i))) out.ultimos4 = m[1];
    if ((m = l.match(/^\s*SALDO ANTERIOR\s+(-?[\d.]+,\d{2})(?:\s+(-?[\d.]+,\d{2}))?/i))) {
      out.saldoAnterior = { ars: parseMonto(m[1]), usd: m[2] ? parseMonto(m[2]) : 0 };
    }
    if ((m = l.match(/^\s*TOTAL A PAGAR\s+(-?[\d.]+,\d{2})(?:\s+(-?[\d.]+,\d{2}))?/i))) {
      out.total = { ars: parseMonto(m[1]), usd: m[2] ? parseMonto(m[2]) : 0 };
    }
    if ((m = l.match(/pago m[ií]nimo de \$\s*([\d.]+,?\d*)/i)) ||
        (m = l.match(/^\s*\$\s*([\d.]+,\d{2})\s*$/) ) && /PAGO MINIMO/i.test(lineas[i - 2] || '')) {
      out.pagoMinimo = parseMonto(m[1]);
    }

    // "Cuotas a vencer": los seis meses que el banco ya tiene comprometidos.
    if (/Cuotas a vencer/i.test(l)) {
      const cab = (lineas[i + 1] || '').trim().split(/\s{1,}/).map(parsePeriodo).filter(Boolean);
      const val = (lineas[i + 2] || '').match(/\$\s*([\d.]+,\d{2})/g) || [];
      cab.forEach((p, k) => {
        if (val[k]) out.cuotasAVencer.push({ periodo: p, monto: parseMonto(val[k].replace('$', '')) });
      });
    }

    const imp = leerImpuesto(l);
    if (imp) { out.impuestos.push(imp); continue; }

    if (esPago(l)) {
      const c = leerConsumo(l, { conCuota: false });
      if (c) out.pagos.push({ fecha: c.fecha, concepto: c.comercio, ars: c.ars, usd: c.usd });
      continue;
    }

    const c = leerConsumo(l, { conCuota: conCuotaEnFila || enCuotasDelMes });
    if (c) out.consumos.push(c);
  }
  return out;
}

/**
 * Convierte los consumos en movimientos de la app.
 * Una compra en cuotas se guarda como UNA fila con el total y la cantidad
 * de cuotas, igual que el resto de la app — asi corregirla las corrige todas.
 */
export function aMovimientos(resumen, accountId = null) {
  // Galicia repite el comprobante '000001' en filas distintas del mismo dia,
  // asi que la clave lleva tambien el importe, y un sufijo si aun asi choca.
  const vistos = new Map();
  const clave = c => {
    const base = `${resumen.marca}:${resumen.ciclo?.cierre || ''}:${c.fecha}:` +
                 `${c.comprobante || '-'}:${c.usd != null ? c.usd : c.ars}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
  return resumen.consumos.map(c => ({
    fecha: c.fecha,
    descripcion: c.comercio,
    comercio: c.comercio,
    monto: c.usd != null ? c.usd : c.ars,
    moneda: c.usd != null ? 'USD' : 'ARS',
    tipo: 'gasto',
    cuotas: c.cuota ? c.cuota.total : 1,
    account_id: accountId,
    fuente: 'resumen',
    revisado: false,
    // El resumen trae el importe de LA CUOTA, no el de la compra entera.
    externo_id: clave(c),
    notas: c.cuota ? `cuota ${c.cuota.nro} de ${c.cuota.total}` : null
  }));
}
