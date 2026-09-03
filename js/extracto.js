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

const NUMERO = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?/g;

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
  // Tiene que parecer un extracto de cuenta y no un resumen de tarjeta: los
  // dos traen fechas e importes, y confundirlos cargaría los consumos dos
  // veces.
  const esExtracto = /saldo\s*(inicial|anterior|final|al d[ií]a)|movimientos de (la )?cuenta|resumen de cuenta|cuenta corriente|caja de ahorro/i.test(todo);
  if (!esExtracto) return null;

  const banco = /galicia/i.test(todo) ? 'galicia'
              : /santander/i.test(todo) ? 'santander'
              : /naci[oó]n/i.test(todo) ? 'nacion'
              : /bbva|franc[eé]s/i.test(todo) ? 'bbva'
              : /macro/i.test(todo) ? 'macro' : null;

  const cbu = todo.match(/\b(\d{22})\b/)?.[1] || null;
  const nro = todo.match(/(?:cuenta|cta)\.?\s*(?:n[°º]?\s*)?([\d-/]{6,})/i)?.[1] || null;

  // El período: sale del encabezado, y si no hay, de las fechas que se lean.
  const rango = todo.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*(?:al|a|-|hasta)\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
  const desde = rango ? fecha(rango[1]) : null;
  const hasta = rango ? fecha(rango[2]) : null;
  const anio = desde ? Number(desde.slice(0, 4)) : null;
  const mesRef = desde ? Number(desde.slice(5, 7)) : null;

  const saldoInicial = buscarSaldo(lineas, /saldo\s*(inicial|anterior|al\s+inicio)/i);
  const saldoFinal = buscarSaldo(lineas, /saldo\s*(final|al\s+cierre|al\s+d[ií]a)/i);

  const crudos = [];
  for (const l of lineas) {
    const f = l.match(/^(\d{1,2}[-/.](?:[A-Za-zÁÉÍÓÚáéíóú]{3,}|\d{1,2})(?:[-/.]\d{2,4})?)\s+(.+)$/);
    if (!f) continue;
    const iso = fecha(f[1], anio, mesRef);
    if (!iso) continue;

    const nums = f[2].match(NUMERO);
    if (!nums || !nums.length) continue;

    // El último número de la fila es el saldo; el anterior, el importe. Si
    // hay uno solo, no hay saldo con qué comparar y se resuelve más abajo.
    const saldo = nums.length > 1 ? monto(nums[nums.length - 1]) : null;
    const importe = Math.abs(monto(nums[nums.length > 1 ? nums.length - 2 : 0]) || 0);
    if (!importe) continue;

    const descripcion = f[2].slice(0, f[2].indexOf(nums[0])).trim()
      .replace(/\s{2,}/g, ' ').replace(/[.\s]+$/, '');
    if (!descripcion) continue;

    crudos.push({ fecha: iso, descripcion, importe, saldo,
                  // Un guion al final es el signo en varios formatos.
                  negativo: /-$/.test(nums[nums.length > 1 ? nums.length - 2 : 0]) });
  }
  if (!crudos.length) return null;

  const movimientos = darSigno(crudos, saldoInicial);
  return {
    banco, cuenta: nro, cbu,
    periodo: { desde, hasta },
    saldoInicial, saldoFinal,
    movimientos,
    // Si la suma de los movimientos lleva del saldo inicial al final, se leyó
    // todo. Es la única forma de saber que no faltó una hoja, y sin eso el
    // "gasto del banco" del mes puede estar incompleto y nadie se entera.
    cuadra: cuadra(saldoInicial, saldoFinal, movimientos)
  };
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
  let previo = saldoInicial;
  return crudos.map(c => {
    let entra = null, seguro = false;
    if (c.saldo != null && previo != null) {
      const dif = Math.round((c.saldo - previo) * 100) / 100;
      // Con el importe justo, el signo es un hecho y no una interpretación.
      if (Math.abs(Math.abs(dif) - c.importe) < 0.05) { entra = dif > 0; seguro = true; }
    }
    if (entra === null) entra = c.negativo ? false : ENTRA.test(c.descripcion);
    if (c.saldo != null) previo = c.saldo;
    return { fecha: c.fecha, descripcion: c.descripcion, importe: c.importe,
             saldo: c.saldo, entra, seguro };
  });
}

function cuadra(inicial, final, movs) {
  if (inicial == null || final == null) return null;
  const suma = movs.reduce((s, m) => s + (m.entra ? m.importe : -m.importe), 0);
  return Math.abs((inicial + suma) - final) < 1;
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
    const id = queCargo(m.descripcion);
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
    .filter(m => !soloCargos || queCargo(m.descripcion))
    .map(m => ({
      fecha: m.fecha,
      descripcion: m.descripcion,
      comercio: m.descripcion,
      monto: m.importe,
      moneda: 'ARS',
      tipo: m.entra ? 'ingreso' : 'gasto',
      cuotas: 1,
      account_id: accountId,
      fuente: 'extracto',
      revisado: false,
      externo_id: clave(m),
      cargoBanco: queCargo(m.descripcion)
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
