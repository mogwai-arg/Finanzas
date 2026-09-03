// =====================================================================
// extracto.js — lectura del resumen de CUENTA del banco (no el de tarjeta).
//
// Es otro documento y sirve para otra cosa. El de tarjeta trae lo que
// compraste; el de cuenta trae lo que se movió en la cuenta, y ahí adentro
// están los gastos hormiga que no manda ningún aviso: comisiones de
// mantenimiento, seguros que se renuevan solos, el impuesto al débito y al
// crédito, retenciones. Cada uno chico, todos los meses, y nunca aparecen en
// una lista de gastos porque nadie los carga.
//
// El problema de leerlo es que cada banco arma las columnas distinto y el
// PDF las pierde: no se sabe cuál número es débito y cuál crédito.
//
// La salida es el SALDO. Cada línea trae el saldo después del movimiento, y
// la diferencia contra el saldo anterior dice el signo sin ambigüedad y sin
// depender de ninguna columna. Si el saldo bajó, salió plata.
//
// Entra texto plano, sale un objeto. Sin DOM, sin red.
// =====================================================================

/** '1.276.838,45' -> 1276838.45 · '-53,72' -> -53.72 */
export function monto(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
                jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

/**
 * '02/09', '02/09/26' y '02-Sep-26' -> '2026-09-02'.
 *
 * Muchos extractos no imprimen el año en cada fila: se toma el del período
 * del encabezado, y si el mes de la fila es posterior al del período es que
 * el período cruza un fin de año.
 */
export function fecha(s, anio = null, mesRef = null) {
  const m = String(s).trim()
    .match(/^(\d{1,2})[-/.]([A-Za-zÁÉÍÓÚáéíóú]{3,}|\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = /^\d+$/.test(m[2]) ? Number(m[2]) : MESES[m[2].toLowerCase().slice(0, 3)];
  if (!mes || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  let y = m[3] ? Number(m[3]) : (anio || new Date().getFullYear());
  if (y < 100) y += 2000;
  // Sin año en la fila y con un período que arranca en diciembre, enero es
  // del año siguiente.
  if (!m[3] && mesRef && mes < mesRef - 6) y += 1;
  return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Un importe con coma decimal (1.234,56 o 1234,56) o, si el banco no imprime
// centavos, uno con separador de miles (20.581). Un entero pelado NO entra:
// seria confundir un numero de comprobante con plata.
const NUMERO = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?|-?\d{1,3}(?:\.\d{3})+-?/g;

// Un renglon de movimiento: empieza con una fecha y despues trae algo.
const FILA = /^(\d{1,2}[-/.](?:[A-Za-zÁÉÍÓÚáéíóú]{3,}|\d{1,2})(?:[-/.]\d{2,4})?)\s+(.+)$/;

/**
 * Lee un extracto de cuenta.
 *
 * Devuelve { banco, cuenta, periodo, saldoInicial, saldoFinal, movimientos }.
 * Cada movimiento: { fecha, descripcion, importe, saldo, entra }.
 */
export function parseExtracto(texto) {
  const lineas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lineas.length < 3) return null;

  const todo = lineas.join('\n');

  // ¿Es un extracto de cuenta y no un resumen de tarjeta? Los dos traen
  // fechas e importes, y confundirlos cargaría los consumos dos veces.
  //
  // La primera version lo decidia por palabras del encabezado, y eso es
  // fragil: cada banco titula distinto y el primero de verdad no dijo
  // ninguna de las que esperabamos. La senal que no depende del vocabulario
  // es la ESTRUCTURA: un extracto de cuenta lleva el saldo corriendo al lado
  // de cada movimiento, asi que casi todas sus filas traen dos importes. Un
  // resumen de tarjeta trae uno solo por consumo.
  const porPalabra = /saldo|movimientos de (la )?cuenta|resumen de cuenta|cuenta corriente|caja de ahorro|extracto/i.test(todo);
  const filas = lineas.map(l => l.match(FILA)).filter(Boolean);
  const conDos = filas.filter(f => (f[2].match(NUMERO) || []).length >= 2).length;
  const porForma = filas.length >= 3 && conDos / filas.length >= 0.5;
  if (!porPalabra && !porForma) return null;
  // Con palabras pero sin saldo corriendo, es casi seguro el de la tarjeta.
  if (porPalabra && filas.length >= 3 && !porForma &&
      /visa|mastercard|amex|l[ií]mite de compra|pago m[ií]nimo/i.test(todo)) return null;

  const banco = /galicia/i.test(todo) ? 'galicia'
              : /santander/i.test(todo) ? 'santander'
              : /naci[oó]n/i.test(todo) ? 'nacion'
              : /bbva|franc[eé]s/i.test(todo) ? 'bbva'
              : /macro/i.test(todo) ? 'macro' : null;

  const cbu = todo.match(/\b(\d{22})\b/)?.[1] || null;
  const nro = todo.match(/(?:cuenta|cta)\.?\s*(?:n[°º]?\s*)?([\d-/]{6,})/i)?.[1] || null;

  // El período: sale del encabezado, y si no hay, de las fechas que se lean.
  // "del 01/09 al 30/09", y tambien dos fechas sueltas en la misma linea, que
  // es como las imprime Galicia debajo del rotulo "Periodo de movimientos".
  const rango = todo.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*(?:al|a|-|hasta|\s)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
  const desde = rango ? fecha(rango[1]) : null;
  const hasta = rango ? fecha(rango[2]) : null;
  const anio = desde ? Number(desde.slice(0, 4)) : null;
  const mesRef = desde ? Number(desde.slice(5, 7)) : null;

  // Cada banco lo titula distinto: "saldo anterior", "saldo último extracto",
  // "saldo al inicio del período".
  const saldoInicial = buscarSaldo(lineas,
    /saldo\s*(inicial|anterior|[uú]ltimo|al\s+inicio|al\s+comienzo|del\s+per[ií]odo\s+anterior)/i);
  const saldoFinal = buscarSaldo(lineas,
    /saldo\s*(final|actual|al\s+cierre|al\s+d[ií]a|disponible|total)/i);

  const crudos = [];
  for (const l of lineas) {
    const f = l.match(FILA);
    // Debajo de cada movimiento vienen renglones sueltos con el comercio y
    // los numeros de la operacion. Son la unica forma de distinguir un
    // "PAGO DE SERVICIOS" de otro: sin ellos, Aysa, el gas y el municipio son
    // la misma fila repetida.
    if (!f) { if (crudos.length) crudos[crudos.length - 1].extra.push(l); continue; }
    const iso = fecha(f[1], anio, mesRef);
    if (!iso) continue;

    const nums = f[2].match(NUMERO);
    if (!nums || !nums.length) continue;

    // El último número de la fila es el saldo; el anterior, el importe. Si
    // hay uno solo, no hay saldo con qué comparar y se resuelve más abajo.
    const saldo = nums.length > 1 ? monto(nums[nums.length - 1]) : null;
    const importe = Math.abs(monto(nums[nums.length > 1 ? nums.length - 2 : 0]) || 0);
    if (!importe) continue;

    // Muchos extractos traen una segunda fecha (fecha valor) antes de la
    // descripcion: sacarla evita que el comercio quede como "02/09 EDESUR".
    const descripcion = f[2].slice(0, f[2].indexOf(nums[0]))
      .replace(/^\s*\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\s+/, '')
      // La columna "Origen" es un codigo de cuatro digitos entre la
      // descripcion y el importe: no es parte del nombre.
      .replace(/\s+\d{4}\s*$/, '')
      .trim().replace(/\s{2,}/g, ' ').replace(/[.:\s]+$/, '');
    if (!descripcion) continue;

    // El signo escrito. Galicia pone el menos ADELANTE del importe; otros
    // formatos lo ponen atras. Cuando esta, no hay nada que inferir.
    const bruto = nums[nums.length > 1 ? nums.length - 2 : 0];
    crudos.push({ fecha: iso, descripcion, importe, saldo,
                  signo: /^-/.test(bruto) ? -1 : /-$/.test(bruto) ? -1 : null,
                  extra: [] });
  }
  if (!crudos.length) return null;

  for (const c of crudos) c.comercio = comercioDe(c);
  const movimientos = darSigno(crudos, saldoInicial);

  // Los saldos, cuando el encabezado no los dio con todas las letras. El
  // ultimo movimiento trae el saldo final, y del primero se deduce con que
  // arrancaba: son datos de las mismas filas, no de un rotulo que cada banco
  // escribe distinto.
  const primero = movimientos[0], ultimo = movimientos[movimientos.length - 1];
  const inicial = saldoInicial != null ? saldoInicial
    : (primero && primero.saldo != null
        ? round2(primero.saldo - (primero.entra ? primero.importe : -primero.importe))
        : null);
  const final = saldoFinal != null ? saldoFinal
    : (ultimo && ultimo.saldo != null ? ultimo.saldo : null);
  return {
    banco, cuenta: nro, cbu,
    // Sin encabezado que lo diga, el periodo son las fechas que se leyeron.
    periodo: { desde: desde || (primero && primero.fecha) || null,
               hasta: hasta || (ultimo && ultimo.fecha) || null },
    saldoInicial: inicial, saldoFinal: final,
    movimientos,
    // Si la suma de los movimientos da los totales que imprime el banco, se
    // leyó todo. Es la única forma de saber que no faltó una hoja, y sin eso
    // el "gasto del banco" del mes puede estar incompleto y nadie se entera.
    //
    // Contra los TOTALES del banco y no contra los saldos: los saldos se
    // deducen de las mismas filas que estamos comprobando, así que cuadrarían
    // siempre y no comprobarían nada.
    cuadra: cuadra(totalesDe(lineas), movimientos, inicial, final)
  };
}

/**
 * Lo que NO es un gasto aunque salga plata de la cuenta.
 *
 * Pagar la tarjeta, pasar plata a otra cuenta tuya o comprar dolares mueven
 * el saldo pero no son gasto: lo que se compro con la tarjeta ya conto el dia
 * de la compra, y la plata que va de un bolsillo tuyo a otro sigue siendo
 * tuya. Importarlas como gasto seria contar 1,2 millones dos veces y romper
 * el mes entero.
 */
const CLASES = [
  { clase: 'transferencia', re: /pago (de )?tarjeta|pago visa|pago master|transf\.? ?ctas?\.? propias|compra ?(y|-)? ?venta de dolares|compra moneda extran|entre cuentas propias/i }
];
export function queClase(descripcion = '') {
  for (const c of CLASES) if (c.re.test(descripcion)) return c.clase;
  return null;
}

/**
 * El comercio de verdad, de los renglones que cuelgan del movimiento.
 *
 * "PAGO DE SERVICIOS" no dice nada: abajo dice AYSA, o NATURGY, o el
 * municipio. Se descartan los renglones que son solo numeros —CUIT, cuenta,
 * numero de operacion— y los rotulos del banco.
 */
function comercioDe(c) {
  const RUIDO = /^(operacion|varios|cotizacion|acred|banco de|reintegros?\b|compra moneda|pago con transf|p[aá]gina|resumen de|fecha descripci)/i;
  for (const l of c.extra) {
    const t = l.trim();
    if (t.length < 3 || t.length > 40) continue;
    if (RUIDO.test(t)) continue;
    if (/^ticket/i.test(t)) continue;
    // Casi todo numeros: es un CUIT, una cuenta, o el codigo que el banco
    // imprime al pie de cada hoja. Nunca es el nombre de nadie.
    const digitos = (t.match(/\d/g) || []).length;
    if (digitos / t.length > 0.5) continue;
    return t;
  }
  return null;
}

function buscarSaldo(lineas, re) {
  for (const l of lineas) {
    if (!re.test(l)) continue;
    const nums = l.match(NUMERO);
    if (nums?.length) return monto(nums[nums.length - 1]);
  }
  return null;
}

/**
 * El signo de cada movimiento, por la diferencia de saldo.
 *
 * Es lo que evita tener que adivinar columnas: si el saldo bajó, salió plata.
 * Cuando la fila no trae saldo se cae en la única otra pista que hay —el
 * texto— y se deja anotado que fue así, para poder revisarlo.
 */
function darSigno(crudos, saldoInicial) {
  const ENTRA = /acredit|dep[oó]sito|transferencia recibida|haberes|sueldo|ingreso|devoluci[oó]n|reintegro|cr[eé]dito|a favor|plazo fijo vto/i;
  // Si ALGUNA fila trae el menos escrito, este resumen marca los débitos con
  // signo: entonces una fila sin menos es un crédito, y eso es un hecho del
  // documento, no una interpretación del texto. Sirve sobre todo para la
  // primera fila, que no tiene un saldo anterior con qué compararse.
  const usaMenos = crudos.some(c => c.signo === -1);
  let previo = saldoInicial;
  return crudos.map(c => {
    let entra = null, seguro = false;
    if (c.saldo != null && previo != null) {
      const dif = Math.round((c.saldo - previo) * 100) / 100;
      // Con el importe justo, el signo es un hecho y no una interpretación.
      if (Math.abs(Math.abs(dif) - c.importe) < 0.05) { entra = dif > 0; seguro = true; }
    }
    // El signo escrito es tan cierto como el saldo, y sirve donde el saldo no
    // llega: en la PRIMERA fila, que no tiene contra qué compararse.
    if (entra === null && c.signo != null) { entra = c.signo > 0; seguro = true; }
    if (entra === null && usaMenos) { entra = true; seguro = true; }
    if (entra === null) entra = ENTRA.test(c.descripcion);
    if (c.saldo != null) previo = c.saldo;
    return { fecha: c.fecha, descripcion: c.descripcion, comercio: c.comercio || null,
             importe: c.importe, saldo: c.saldo, entra, seguro, clase: queClase(c.descripcion) };
  });
}

/**
 * Los totales que imprime el banco al pie: entró, salió, y el saldo.
 *
 * Se reconoce por la forma —tres importes en una línea sin fecha, con el del
 * medio en negativo— y no por la palabra "Total", que en este resumen aparece
 * en el renglón de ABAJO y en otros bancos ni aparece.
 */
function totalesDe(lineas) {
  for (const l of lineas) {
    if (FILA.test(l)) continue;
    const nums = l.match(NUMERO);
    if (!nums || nums.length !== 3) continue;
    const [a, b, c] = nums.map(monto);
    if (a == null || b == null || c == null) continue;
    if (!(a > 0 && b < 0)) continue;
    return { entro: a, salio: Math.abs(b), saldo: c };
  }
  return null;
}

function cuadra(totales, movs, inicial, final) {
  const suma = (f) => round2(movs.filter(f).reduce((s, m) => s + m.importe, 0));
  if (totales) {
    return Math.abs(suma(m => m.entra) - totales.entro) < 1 &&
           Math.abs(suma(m => !m.entra) - totales.salio) < 1;
  }
  // Sin totales impresos, la única comprobación posible es contra los saldos
  // que el encabezado haya declarado.
  if (inicial == null || final == null) return null;
  const neto = movs.reduce((s, m) => s + (m.entra ? m.importe : -m.importe), 0);
  return Math.abs((inicial + neto) - final) < 1;
}

// ---------------------------------------------------------------------
// LO QUE COBRA EL BANCO
// ---------------------------------------------------------------------

/**
 * Los cargos del banco, por concepto.
 *
 * Son los gastos hormiga que no manda ningún aviso y que nadie carga a mano:
 * mantenimiento de cuenta, el impuesto al débito y al crédito, seguros que se
 * renuevan solos, retenciones de ingresos brutos, sellados. Cada uno chico,
 * todos los meses, y sumados no tanto.
 *
 * Se separan del resto porque no son decisiones: no se pueden "gastar menos",
 * se cambian de paquete o se discuten. Mezclados con el supermercado no se
 * ven nunca.
 */
export const CARGOS = [
  { id: 'mantenimiento', nombre: 'Mantenimiento de cuenta',
    re: /mantenimiento|paquete|cuota\s*(mensual|servicio)|costo.*cuenta|servicio de cuenta/i },
  { id: 'ley25413', nombre: 'Impuesto al débito y crédito',
    re: /ley\s*25\.?413|imp(uesto)?\.?\s*(al\s*)?(d[eé]bito|cr[eé]dito)|imp\s*ley/i },
  { id: 'iibb', nombre: 'Retención de ingresos brutos',
    re: /sircreb|ing(resos)?\.?\s*brutos|iibb|retenci[oó]n.*brutos/i },
  { id: 'iva', nombre: 'IVA y percepciones',
    re: /\biva\b|percepci[oó]n|r\.?g\.?\s*\d{4}/i },
  { id: 'seguro', nombre: 'Seguros de la cuenta',
    re: /seguro|bolso protegido|protecci[oó]n|asistencia/i },
  { id: 'comision', nombre: 'Comisiones',
    re: /comisi[oó]n|cargo por|gastos administrativos|transferencia.*comisi/i },
  { id: 'tarjeta', nombre: 'Costos de tarjeta',
    re: /renovaci[oó]n.*tarjeta|emisi[oó]n.*tarjeta|cargo.*tarjeta|adicional.*tarjeta/i },
  { id: 'sellado', nombre: 'Sellados y timbrados',
    re: /sellado|timbrado|impuesto de sellos/i }
];

/** A qué cargo del banco corresponde una descripción, o null si no es uno. */
export function queCargo(descripcion = '') {
  for (const c of CARGOS) if (c.re.test(descripcion)) return c.id;
  return null;
}

/**
 * Lo que te cobró el banco en un extracto ya leído, agrupado por concepto.
 *
 * Devuelve { total, conceptos: [{ id, nombre, monto, cuantos, filas }] },
 * de mayor a menor.
 */
export function cargosDelBanco(movimientos) {
  const por = new Map();
  let total = 0;
  for (const m of movimientos || []) {
    if (m.entra) continue;
    const id = queCargo(`${m.descripcion} ${m.comercio || ''}`);
    if (!id) continue;
    const c = por.get(id) || { id, nombre: CARGOS.find(x => x.id === id).nombre,
                               monto: 0, cuantos: 0, filas: [] };
    c.monto = Math.round((c.monto + m.importe) * 100) / 100;
    c.cuantos++;
    c.filas.push(m);
    por.set(id, c);
    total = Math.round((total + m.importe) * 100) / 100;
  }
  return { total, conceptos: [...por.values()].sort((a, b) => b.monto - a.monto) };
}

/**
 * Los movimientos del extracto listos para guardar.
 *
 * `externo_id` es lo que evita duplicar al importar el mismo extracto dos
 * veces, y también al importarlo sobre lo que ya entró por los avisos del
 * banco: la clave es la fecha, el importe y el comercio, que es lo único que
 * los dos lados comparten.
 */
export function aMovimientos(ext, accountId, { soloCargos = false } = {}) {
  const vistos = new Map();
  const clave = m => {
    const base = `ext:${m.fecha}:${Math.round(m.importe * 100)}:` +
                 m.descripcion.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18);
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
  return (ext.movimientos || [])
    .filter(m => !soloCargos || queCargo(`${m.descripcion} ${m.comercio || ''}`))
    .map(m => ({
      fecha: m.fecha,
      descripcion: m.descripcion,
      // El comercio de verdad viene de los renglones de abajo: sin eso, todos
      // los "PAGO DE SERVICIOS" son la misma fila repetida.
      comercio: m.comercio || m.descripcion,
      monto: m.importe,
      moneda: 'ARS',
      tipo: m.clase === 'transferencia' ? 'transferencia'
          : m.entra ? 'ingreso' : 'gasto',
      cuotas: 1,
      account_id: accountId,
      fuente: 'extracto',
      revisado: false,
      externo_id: clave(m),
      cargoBanco: queCargo(`${m.descripcion} ${m.comercio || ''}`)
    }));
}

/**
 * Lo que te cobró el banco, mes a mes.
 *
 * Se calcula sobre los movimientos ya cargados y no sobre el extracto: asi
 * vale para todos los meses que hayas importado, y tambien para lo que haya
 * entrado por otro lado con el mismo nombre.
 *
 * Es la parte que convierte esto en algo util: un cargo de 18.500 una vez no
 * es nada, doce veces son 222.000, y la unica forma de discutir un paquete es
 * saber cuanto sale por ano.
 */
export function cargosPorMes(txs, meses = 6, ref = new Date()) {
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const per = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const del = (txs || []).filter(t =>
      t.tipo === 'gasto' && (t.moneda || 'ARS') === 'ARS' &&
      String(t.fecha).slice(0, 7) === per &&
      queCargo(t.comercio || t.descripcion || ''));
    out.push({
      periodo: per,
      total: Math.round(del.reduce((s, t) => s + (Number(t.monto) || 0), 0) * 100) / 100,
      cuantos: del.length,
      conceptos: cargosDelBanco(del.map(t => ({
        descripcion: t.comercio || t.descripcion || '', importe: Number(t.monto) || 0,
        entra: false, fecha: t.fecha }))).conceptos
    });
  }
  return out;
}

/**
 * Que vio el lector cuando no pudo leer.
 *
 * Un "no lo reconozco" a secas es un callejon sin salida: el que lo lee no
 * sabe si el problema es el formato, si copio media hoja o si el PDF vino
 * escaneado. Y del otro lado, sin saber que vio, hay que adivinar.
 *
 * Es la misma idea del diagnostico de los avisos: cuando algo falla, la app
 * tiene que decir lo que sabe, no lo que no pudo.
 */
export function revisarExtracto(texto) {
  const lineas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const todo = lineas.join('\n');
  const filas = lineas.map(l => l.match(FILA)).filter(Boolean);
  const conImporte = filas.filter(f => (f[2].match(NUMERO) || []).length >= 1);
  const conSaldo = filas.filter(f => (f[2].match(NUMERO) || []).length >= 2);

  return {
    lineas: lineas.length,
    conFecha: filas.length,
    conImporte: conImporte.length,
    conSaldo: conSaldo.length,
    nombraSaldo: /saldo/i.test(todo),
    pareceTarjeta: /visa|mastercard|amex|l[ií]mite de compra|pago m[ií]nimo/i.test(todo),
    // Las primeras filas con fecha, para poder ver como vienen de verdad.
    muestra: filas.slice(0, 4).map(f => `${f[1]} ${f[2]}`.slice(0, 90)),
    // Y el arranque del texto, que es donde esta el encabezado.
    encabezado: lineas.slice(0, 4).map(l => l.slice(0, 70))
  };
}
