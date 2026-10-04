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
  let t = String(s).trim().replace(/\s/g, '');
  // Sin un digito no hay importe. `Number('')` es 0, y un cero que en verdad
  // es "no se" se suma como si fuera plata: '-,--' en la columna del pago
  // minimo en dolares pasaba a ser cero dolares.
  if (!/\d/.test(t)) return null;
  // El menos puede ir atras: el resumen de Visa escribe el pago como
  // '1.275.752,92-'. Leido sin esto da un pago POSITIVO, o sea un consumo de
  // un millon doscientos mil que nadie hizo.
  let neg = false;
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// Con que se separa el dia del mes. Los tres conviven: el resumen de
// Mastercard escribe '20-09-26' y el de Visa, del MISMO banco, '20.09.26'.
// El punto faltaba, asi que un resumen de Visa entero se leia sin un solo
// consumo —no fallaba: devolvia cero, que es peor, porque parece que el PDF
// no tiene nada adentro—.
//
// Va en una constante porque esto estaba escrito a mano en cinco expresiones
// distintas y no decian todas lo mismo.
const SEP = '[-/.]';
const FECHA = `\\d{1,2}${SEP}(?:[A-Za-z]{3}|\\d{2})${SEP}\\d{2}`;

/** '30-Jul-26', '30-07-26' y '30.07.26' -> '2026-07-30'. null si no es fecha. */
export function parseFecha(s) {
  const m = String(s).trim().match(
    new RegExp(`^(\\d{1,2})${SEP}([A-Za-zÁÉÍÓÚáéíóú]{3,}|\\d{1,2})${SEP}(\\d{2}|\\d{4})$`));
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
  const m = String(s).trim().match(new RegExp(`^([A-Za-zÁÉÍÓÚáéíóú]+)${SEP}(\\d{2}|\\d{4})$`));
  if (!m) return null;
  const mes = MESES[m[1].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  const anio = m[2].length === 4 ? Number(m[2]) : 2000 + Number(m[2]);
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

export function detectarEmisor(texto) {
  if (!/Banco Galicia|CUIT Banco: 30-50000173-5|galicia/i.test(texto) &&
      !/Resumen de tarjeta de credito/i.test(texto)) return null;
  if (/MASTERCARD/i.test(texto)) return { emisor: 'galicia', marca: 'mastercard', producto: producto(texto) };
  if (/\bVISA\b/i.test(texto))   return { emisor: 'galicia', marca: 'visa', producto: producto(texto) };
  return null;
}

/**
 * El nombre comercial: 'MASTERCARD BLACK', 'VISA SIGNATURE'. Sirve de nombre
 * de la tarjeta cuando el resumen no imprime los ultimos cuatro digitos, que
 * es lo que pasa con los de Mastercard.
 */
function producto(texto) {
  // Solo dentro de la misma linea: abajo viene el titular y se lo comeria.
  const m = texto.match(/Tarjeta[ \t]+Cr[eé]dito[ \t]+((?:MASTERCARD|VISA)(?:[ \t][A-ZÁÉÍÓÚÑ]+)*)/i);
  return m ? m[1].replace(/[ \t]+/g, ' ').trim() : null;
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
  const re = new RegExp(`(${FECHA})`, 'g');
  for (const linea of texto.split('\n')) {
    const f = (linea.match(re) || []).map(parseFecha).filter(Boolean);
    if (f.length === 6 && f.every((d, i) => i === 0 || d > f[i - 1])) return seis(f);
  }

  // El otro Visa no las pone en una fila: las reparte en seis casillas con
  // etiqueta —CIERRE ACTUAL, VENCIMIENTO, VTO. ANTERIOR, PROXIMO CIERRE,
  // CIERRE ANTERIOR, PROXIMO VTO.— y escribe '01 Oct 26', con espacios.
  //
  // No se leen por etiqueta porque el valor esta en la linea de ABAJO y
  // alineado por columna: eso es leer posiciones de un PDF, y se rompe
  // solo. Se juntan las seis del documento y se ordenan, que es la misma
  // suposicion que ya usa el formato de una fila.
  //
  // Seis exactas o nada: con cinco o con siete no se adivina. Un ciclo
  // equivocado manda el resumen entero al mes que no es, y eso es peor que
  // no leerlo.
  const largas = [...new Set((texto.match(/\b\d{1,2} [A-Za-z]{3,} \d{2}\b/g) || [])
    .map(x => parseFecha(x.replace(/ /g, '-'))).filter(Boolean))].sort();
  if (largas.length === 6) return seis(largas);
  return null;
}

const seis = f => ({ cierreAnterior: f[0], vencimientoAnterior: f[1],
                     cierre: f[2], vencimiento: f[3],
                     cierreProximo: f[4], vencimientoProximo: f[5] });

// ---------------------------------------------------------------------
// LINEAS
// ---------------------------------------------------------------------

const RE_CUOTA_FINAL = /\s(\d{2})\/(\d{2})\s+(\d{4,})\s/;   // NN/MM antes del comprobante
const RE_IMPUESTO = new RegExp(
  `^(${FECHA})\\s+(DEV\\.?IMP\\.?\\s+)?(.+?)\\s+([\\d.,]+)\\s*%\\s*\\(\\s*([\\d.,]+)\\s*\\)\\s+(-?[\\d.,]+-?)`, 'i');

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
  const m = linea.match(new RegExp(`^(${FECHA})\\s+(.*)$`));
  if (!m) return null;
  const fecha = parseFecha(m[1]);
  if (!fecha) return null;
  let resto = ' ' + m[2].trimEnd() + ' ';

  // Marca de Visa: un '*' o una 'K' sueltos despues de la fecha.
  let marca = null;
  const mk = resto.match(/^\s([*K])\s/);
  if (mk) { marca = mk[1]; resto = resto.slice(mk[0].length - 1); }

  // El otro Visa pone el comprobante ADELANTE, con la marca pegada:
  // '29.09.26  426717   APPLE.COM/BILL' o '30.09.26  284053*  ADOBE'. Leido
  // con las reglas del otro formato, el numero quedaba dentro del nombre del
  // comercio: '158758* DLO*Eclipse'.
  let comprobante = null;
  const mcIni = resto.match(/^\s(\d{4,})([*K]?)\s/);
  if (mcIni) {
    comprobante = mcIni[1];
    if (mcIni[2]) marca = mcIni[2];
    resto = resto.slice(mcIni[0].length - 1);
  }

  // El ultimo importe de la fila. Si la descripcion trae 'USD', es dolares.
  // El menos puede ir atras: '1.275.752,92-'.
  const mm = resto.match(/(-?[\d][\d.]*,\d{2}-?)\s*$/);
  if (!mm) return null;
  const importe = parseMonto(mm[1]);
  resto = resto.slice(0, mm.index) + ' ';

  // Comprobante al final, que es donde lo pone el otro formato.
  if (comprobante == null) {
    const mc = resto.match(/\s(\d{4,})\s*$/);
    if (mc) { comprobante = mc[1]; resto = resto.slice(0, mc.index) + ' '; }
  }

  // Un consumo en dolares repite el importe dentro de la descripcion,
  // precedido por 'USD'. Ojo: a veces viene pegado al comercio
  // ('Microsoft*Xbox G MicrosoftUSD  12,85'), asi que no sirve buscar
  // \bUSD\b — hay que buscar el par 'USD <importe>' al final.
  const enDolares = /USD\s*[\d.]*,\d{2}\s*$/i.test(resto);

  // Cuota: NN/MM pegado al comprobante. Solo donde el formato la admite.
  let cuota = null;
  if (conCuota) {
    // Con la palabra o sin ella: 'Cuota 03/03' y '03/03' son lo mismo.
    const cu = resto.match(/\s(?:cuota\s+)?(\d{2})\/(\d{2})\s*$/i);
    if (cu) {
      cuota = { nro: Number(cu[1]), total: Number(cu[2]) };
      resto = resto.slice(0, cu.index) + ' ';
    }
  }

  // Algunos comercios arrastran una referencia larga: 'CUOTA SOCIAL CAR
  // 000000000000000'. Ocho digitos seguidos al final nunca son parte del nombre.
  const comercio = resto.replace(/\s*USD\s*[\d.,]*\s*$/i, '')
    .replace(/\s+/g, ' ').trim().replace(/\s+\d{8,}$/, '').trim();
  if (!comercio) return null;

  return { fecha, comercio, cuota, comprobante, marca,
           ars: enDolares ? null : importe, usd: enDolares ? importe : null };
}

/**
 * La misma linea con un solo espacio entre palabras.
 *
 * El PDF de Visa coloca cada palabra por separado y la reconstruccion deja
 * los huecos de la columna adentro del texto: 'SU  PAGO  EN  PESOS',
 * 'SALDO  ANTERIOR'. Todas las etiquetas que se buscan por nombre fallaban
 * por eso, en silencio: el resumen se leia sin pagos, sin saldo anterior y
 * sin total.
 *
 * Solo para buscar etiquetas. Los importes se encuentran por expresion al
 * final de la linea, asi que no dependen de los huecos.
 */
const unSoloEspacio = l => l.replace(/\s+/g, ' ').trim();

const esPago = l => /SU PAGO/i.test(unSoloEspacio(l));

/** Si un pago o un saldo esta en dolares, segun como lo nombre la linea. */
const enUSD = l => /\b(USD|U\$S|D[OÓ]LAR)/i.test(unSoloEspacio(l));

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

  // El importe tal como aparece, con el menos adelante o atras.
  const IMP = '-?[\\d.]+,\\d{2}-?';

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const ln = unSoloEspacio(l);

    if (/^CUOTA DEL MES$/i.test(ln)) { enCuotasDelMes = true; continue; }
    if (/^(SUBTOTAL|TOTAL A PAGAR|COMPRAS DEL MES)/i.test(ln)) enCuotasDelMes = false;

    let m;
    if ((m = ln.match(/TARJETA\s+(\d{4})\b/i))) out.ultimos4 = m[1];
    if ((m = ln.match(new RegExp(`^SALDO ANTERIOR\\s+(${IMP})(?:\\s+(${IMP}))?`, 'i')))) {
      out.saldoAnterior = { ars: parseMonto(m[1]), usd: m[2] ? parseMonto(m[2]) : 0 };
    }
    // 'TOTAL A PAGAR' en un formato, 'SALDO ACTUAL $ ... U$S ...' en el otro.
    // Es el mismo numero —el que hay que pagar— y sin el la app no sabe
    // contra que comparar lo que tiene cargado.
    if ((m = ln.match(new RegExp(`^TOTAL A PAGAR\\s+(${IMP})(?:\\s+(${IMP}))?`, 'i'))) ||
        (m = ln.match(new RegExp(`^SALDO ACTUAL\\s*\\$?\\s*(${IMP})(?:\\s*U\\$S\\s*(${IMP}))?`, 'i')))) {
      out.total = { ars: parseMonto(m[1]), usd: m[2] ? parseMonto(m[2]) : 0 };
    }
    if ((m = ln.match(/pago m[ií]nimo de \$\s*([\d.]+,?\d*)/i)) ||
        (m = ln.match(/^PAGO M[IÍ]NIMO\s*\$?\s*([\d.]+,\d{2})/i)) ||
        (m = ln.match(/^\$\s*([\d.]+,\d{2})$/)) && /PAGO MINIMO/i.test(lineas[i - 2] || '')) {
      out.pagoMinimo = parseMonto(m[1]);
    }

    // "Cuotas a vencer": los seis meses que el banco ya tiene comprometidos.
    if (/Cuotas a vencer/i.test(ln)) {
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
      // 'SU PAGO EN USD 15,24-' no repite el importe detras del USD, asi que
      // la deteccion por importe no lo ve y el pago en dolares entraba como
      // un pago en pesos de quince con veinticuatro.
      if (c) {
        const monto = c.ars != null ? c.ars : c.usd;
        const usd = c.usd != null || enUSD(l);
        out.pagos.push({ fecha: c.fecha, concepto: c.comercio,
                         ars: usd ? null : monto, usd: usd ? monto : null });
      }
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
  const clave = (c, monto) => {
    // Una compra en cuotas aparece en TODOS los resumenes hasta que termina de
    // pagarse, y es UNA sola compra. Con el cierre adentro de la clave, cada
    // resumen la cargaba de nuevo: una compra en doce cuotas entraba doce
    // veces. Para esas, la clave es la compra —fecha, comprobante y cantidad
    // de cuotas—, igual en todos los resumenes.
    const base = c.cuota
      ? `${resumen.marca}:cuotas:${c.fecha}:${c.comprobante || '-'}:${c.cuota.total}:${monto}`
      : `${resumen.marca}:${resumen.ciclo?.cierre || ''}:${c.fecha}:` +
        `${c.comprobante || '-'}:${monto}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
  return resumen.consumos.map(c => {
    // El resumen cobra UNA cuota; la app guarda la compra entera y reparte
    // ella las cuotas (`cronograma` divide monto por cuotas). Guardar el
    // importe de la cuota con `cuotas: 3` hacia que la compra valiera un
    // tercio: el resumen cobraba 32.556,66 y la tarjeta contaba 10.852,22.
    //
    // Y por eso tampoco se reconocia la compra ya anotada a mano: se compara
    // por importe, y el de la cuota no es el de la compra.
    const dela = c.usd != null ? c.usd : c.ars;
    const monto = c.cuota ? round2(dela * c.cuota.total) : dela;
    return {
      fecha: c.fecha,
      descripcion: c.comercio,
      comercio: c.comercio,
      monto,
      moneda: c.usd != null ? 'USD' : 'ARS',
      tipo: 'gasto',
      cuotas: c.cuota ? c.cuota.total : 1,
      account_id: accountId,
      fuente: 'resumen',
      revisado: false,
      externo_id: clave(c, monto),
      notas: c.cuota
        ? `${c.cuota.total} cuotas de ${dela.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
        + ` · el resumen traia la ${c.cuota.nro}`
        : null
    };
  });
}

const round2 = n => Math.round(n * 100) / 100;
