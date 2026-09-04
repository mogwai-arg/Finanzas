// =====================================================================
// lista.js — la lista de movimientos de la app del banco.
//
// Es la otra forma de que entren los datos, y la mas facil de todas: la
// pantalla de "Movimientos" del homebanking, tal como se ve en el telefono.
// Nombre, fecha, importe. Nada mas.
//
// Y es MEJOR que el PDF, aunque parezca lo contrario:
//
// - El signo viene escrito. En el resumen en PDF no se sabe si un numero es
//   debito o credito —las columnas se pierden— y hay que deducirlo de la
//   diferencia contra el saldo anterior. Aca dice "-$29.600,00" y listo.
// - Esta al dia. El resumen llega una vez por mes y con el mes cerrado; la
//   lista tiene lo de hoy.
// - Sirve para la cuenta y para la tarjeta, que se ven casi igual.
//
// Lo que NO trae: el saldo corriente. Asi que no se puede verificar que
// cuadre, como si se hace con el extracto. A cambio, cada fila se explica
// sola.
// =====================================================================

import { queClase } from './extracto.js';

/** Un importe con signo escrito: "-$29.600,00", "$1.480.000,00", "US$ 850,00". */
const IMPORTE = /^\s*([-−+])?\s*(US\$|U\$S|\$)\s*([\d.]+(?:,\d{1,2})?)\s*$/;

/** Una fecha sola en la linea: 02/09/26, 02/09/2026, 02-09-26. */
const FECHA = /^\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\s*$/;

/** "Cuota 1 de 3", "1/3", "Cuota 2/6". */
const CUOTA = /(?:cuota\s*)?(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i;

// ---------------------------------------------------------------------
// El otro formato: la fecha como titulo de seccion.
//
// Mercado Pago y las billeteras no ponen la fecha en cada renglon: la ponen
// una vez arriba —"Hoy", "3 de septiembre"— y abajo van los movimientos de
// ese dia, cada uno con su hora. Es la pantalla donde estan los rendimientos
// diarios, que por la API no vienen: /v1/payments/search devuelve PAGOS, y un
// rendimiento no es un pago.
// ---------------------------------------------------------------------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "Hoy", "Ayer", "3 de septiembre", "3 de septiembre de 2026". */
const TITULO_FECHA = new RegExp(
  `^\\s*(hoy|ayer|anteayer|(\\d{1,2})\\s+de\\s+(${MESES.join('|')})(?:\\s+de\\s+(\\d{4}))?)\\s*$`, 'i');

/** "00:47". Una hora no es una fecha ni un importe: es ruido con numeros. */
const HORA = /^\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/;

/**
 * "Disponible $ 399.280,61", "Saldo del dia $ 399.075,31".
 *
 * Son saldos, no movimientos. Sin sacarlos, el nombre del primer movimiento de
 * cada dia seria "Disponible $ 399.280,61" y el dia tendria un movimiento
 * inventado del tamano del saldo entero.
 */
const ES_SALDO = /^\s*(disponible|saldo(\s+(del\s+d[ií]a|total|actual|en\s+cuenta))?)\b/i;

function aNumero(s) {
  const t = String(s).replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function aISO(d, m, a) {
  const anio = a.length === 2 ? 2000 + Number(a) : Number(a);
  return `${anio}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
}

/** Lo que una linea es, si es algo. */
function queEs(linea, hoy = new Date()) {
  let m;
  if (HORA.test(linea)) return { que: 'hora' };
  if (ES_SALDO.test(linea)) return { que: 'saldo' };
  if ((m = linea.match(TITULO_FECHA))) return { que: 'titulo', valor: deTitulo(m, hoy) };
  if ((m = linea.match(FECHA))) return { que: 'fecha', valor: aISO(m[1], m[2], m[3]) };
  if ((m = linea.match(IMPORTE))) {
    const n = aNumero(m[3]);
    if (n == null) return null;
    return { que: 'importe', valor: n,
             // El signo escrito es un hecho, no una interpretacion. Es toda
             // la ventaja de este formato sobre el PDF.
             entra: !(m[1] === '-' || m[1] === '−'),
             moneda: m[2] === '$' ? 'ARS' : 'USD' };
  }
  return null;
}

/** La fecha de un titulo de seccion. */
function deTitulo(m, hoy) {
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const correr = n => { const d = new Date(hoy); d.setDate(d.getDate() - n); return d; };
  const t = m[1].toLowerCase();
  if (/^hoy/.test(t)) return iso(hoy);
  if (/^ayer/.test(t)) return iso(correr(1));
  if (/^anteayer/.test(t)) return iso(correr(2));

  const dia = Number(m[2]);
  const mes = MESES.indexOf(m[3].toLowerCase());
  if (!(dia >= 1 && dia <= 31) || mes < 0) return null;
  if (m[4]) return iso(new Date(Number(m[4]), mes, dia));
  // Sin ano es de este ano, salvo que caiga adelante: nadie mira los
  // movimientos del mes que viene.
  let f = new Date(hoy.getFullYear(), mes, dia);
  if (f > hoy) f = new Date(hoy.getFullYear() - 1, mes, dia);
  return iso(f);
}

/**
 * ¿Esto es una lista de movimientos?
 *
 * Se pregunta por la ESTRUCTURA y no por el encabezado: cada banco le pone un
 * titulo distinto, y una captura recortada puede no traerlo. Lo que ninguna
 * otra cosa tiene es la terna nombre + fecha + importe con signo, repetida.
 */
export function pareceLista(texto, hoy = new Date()) {
  const l = String(texto || '').split('\n').map(x => x.trim()).filter(Boolean);
  let fechas = 0, titulos = 0, importes = 0;
  for (const x of l) {
    const q = queEs(x, hoy);
    if (q?.que === 'fecha') fechas++;
    if (q?.que === 'titulo' && q.valor) titulos++;
    if (q?.que === 'importe') importes++;
  }
  // Dos movimientos completos. Con uno solo, cualquier cosa con una fecha y un
  // precio pasaria: una promo, un ticket, media pantalla de otra cosa.
  //
  // Con titulos de seccion alcanza UNO: "Hoy" seguido de tres movimientos es
  // una lista perfectamente valida, y pedir dos dias dejaria afuera la captura
  // mas comun de todas.
  return (fechas >= 2 || titulos >= 1) && importes >= 2;
}

/**
 * Lee la lista y devuelve los movimientos.
 *
 * La fecha es el ancla, no el nombre: es lo unico que siempre esta y que
 * nunca se confunde con otra cosa. El nombre es lo de arriba, el importe es
 * el numero mas cercano —arriba o abajo—, porque segun de donde se copie el
 * texto sale en un orden o en el otro. Copiar de la captura con el dedo, de
 * la app o del navegador da tres ordenes distintos y los tres son validos.
 */
export function parseLista(texto, hoy = new Date()) {
  const crudas = String(texto || '').split('\n').map(x => x.trim());
  const lineas = crudas.filter(Boolean);
  if (!pareceLista(lineas.join('\n'), hoy)) return null;

  const tipos = lineas.map(l => queEs(l, hoy));
  const usadas = new Set();
  const movimientos = [];

  // La fecha por titulo de seccion manda cuando esta: es el formato de las
  // billeteras y no se mezcla con el otro.
  if (tipos.some(t => t?.que === 'titulo' && t.valor)) {
    return porSecciones(lineas, tipos, hoy);
  }

  for (let i = 0; i < lineas.length; i++) {
    if (tipos[i]?.que !== 'fecha') continue;

    // El importe mas cercano que no se llevo otro movimiento. Se mira primero
    // abajo, que es el orden normal, y despues arriba.
    let j = -1;
    for (const k of [i + 1, i - 1, i + 2, i - 2]) {
      if (k < 0 || k >= lineas.length || usadas.has(k)) continue;
      if (tipos[k]?.que === 'importe') { j = k; break; }
    }
    if (j < 0) continue;

    // El nombre: el texto mas cercano hacia arriba que no sea fecha ni
    // importe y que no se haya usado ya.
    let n = -1;
    for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
      if (usadas.has(k) || tipos[k]) continue;
      n = k; break;
    }
    // Si arriba no habia nada —el primer movimiento de una captura recortada
    // empieza por la fecha— se busca abajo antes de rendirse.
    if (n < 0) {
      for (let k = i + 1; k < lineas.length && k <= i + 3; k++) {
        if (usadas.has(k) || tipos[k]) continue;
        n = k; break;
      }
    }

    const nombre = n >= 0 ? lineas[n] : '';
    const cuota = nombre.match(CUOTA);
    usadas.add(i); usadas.add(j); if (n >= 0) usadas.add(n);

    movimientos.push({
      fecha: tipos[i].valor,
      descripcion: nombre,
      comercio: limpiar(nombre),
      importe: Math.abs(tipos[j].valor),
      entra: tipos[j].entra,
      moneda: tipos[j].moneda,
      // La misma clasificacion que el extracto: "Transf. ctas propias" y
      // "Pago de tarjeta" son movidas, no gastos. Sin esto el cotejo las
      // buscaria entre los gastos y diria que faltan seis movimientos que
      // estan perfectos.
      clase: queClase(nombre),
      // "Cuota 2 de 6": el numero de cuota no sirve para cargar la compra
      // —la app guarda la compra entera con su cantidad de cuotas— pero decir
      // que es una cuota evita cargarla como si fuera una compra nueva.
      cuota: cuota ? { nro: Number(cuota[1]), total: Number(cuota[2]) } : null
    });
  }

  if (!movimientos.length) return null;
  const fechas = movimientos.map(m => m.fecha).sort();
  return {
    movimientos,
    periodo: { desde: fechas[0], hasta: fechas[fechas.length - 1] },
    // Sin saldo corriente no hay contra que verificar. Se dice, en vez de
    // dejar creer que se comprobo algo.
    cuadra: null
  };
}

/**
 * La lista con la fecha arriba, como la muestran las billeteras.
 *
 *   Hoy
 *   Disponible $ 399.280,61      <- saldo, no movimiento
 *   Rendimientos
 *   + $ 205,30
 *   00:47                        <- hora, no fecha ni importe
 *   3 de septiembre
 *   ...
 *
 * Se recorre de arriba abajo con la fecha corriente: cada titulo la cambia, y
 * todo lo de abajo es de ese dia. Un movimiento es un nombre seguido de su
 * importe; la hora y los saldos se saltean.
 */
function porSecciones(lineas, tipos, hoy) {
  const movimientos = [];
  let fecha = null, nombre = null;

  for (let i = 0; i < lineas.length; i++) {
    const t = tipos[i];
    if (t?.que === 'titulo') { if (t.valor) fecha = t.valor; nombre = null; continue; }
    if (t?.que === 'hora' || t?.que === 'saldo') continue;
    if (t?.que === 'fecha') { fecha = t.valor; nombre = null; continue; }

    if (t?.que === 'importe') {
      // Un importe sin nombre arriba no es un movimiento: es el saldo del dia
      // escrito en dos renglones, o una cifra suelta de la captura.
      if (!fecha || !nombre) { nombre = null; continue; }
      const cuota = nombre.match(CUOTA);
      movimientos.push({
        fecha, descripcion: nombre, comercio: limpiar(nombre),
        importe: Math.abs(t.valor), entra: t.entra, moneda: t.moneda,
        clase: queClase(nombre),
        cuota: cuota ? { nro: Number(cuota[1]), total: Number(cuota[2]) } : null
      });
      nombre = null;
      continue;
    }

    // Cualquier otra cosa es texto: el nombre del movimiento. Se queda el
    // ultimo, que es el que esta pegado al importe.
    nombre = lineas[i];
  }

  if (!movimientos.length) return null;
  const fechas = movimientos.map(m => m.fecha).sort();
  return { movimientos, periodo: { desde: fechas[0], hasta: fechas[fechas.length - 1] },
           cuadra: null };
}

/**
 * Saca del nombre lo que no es el comercio.
 *
 * "Dep.efvo.autoservicio ticket: 291802" es el mismo deposito todos los
 * meses, pero con el numero de ticket adentro son doce cosas distintas y no
 * se agrupan ni se reconocen.
 */
function limpiar(nombre) {
  return String(nombre || '')
    .replace(/\s*(ticket|comprobante|cbte|nro|n[°º]|ref)\.?\s*:?\s*\d+\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Los movimientos listos para guardar, con la misma forma que los del
 * extracto: asi la pantalla de importar y el cotejo no distinguen de donde
 * vinieron.
 *
 * El identificador se arma con fecha, importe y nombre. No es perfecto —dos
 * cafes iguales el mismo dia son uno solo— pero es lo unico que hay: la lista
 * no trae numero de operacion. Se prefiere perder un duplicado real a cargar
 * dos veces el mismo gasto, que es el error que ensucia el mes.
 */
export function aMovimientos(lista, accountId = null, { tarjeta = false } = {}) {
  return (lista.movimientos || [])
    // El pago del resumen NO se carga desde la lista de la tarjeta.
    //
    // Es plata que sale de una cuenta y salda la tarjeta, y la lista no dice
    // de qué cuenta salió: cargarla acá dejaría una movida sin origen —plata
    // que aparece de la nada— o, peor, duplicaría el pago que ya anotaste
    // desde el lado de la cuenta, que es donde sabés con qué pagaste.
    //
    // Igual aparece en el cotejo de abajo, que es donde sirve: ahí se ve si
    // el pago que anotaste coincide con el que registró el banco.
    .filter(m => !(tarjeta && m.entra))
    .map(m => ({
    fecha: m.fecha,
    descripcion: m.descripcion,
    comercio: m.comercio || m.descripcion,
    monto: m.importe,
    moneda: m.moneda,
    tipo: tipoDe(m, tarjeta),
    account_id: accountId,
    cuotas: 1,
    fuente: tarjeta ? 'lista-tarjeta' : 'lista-cuenta',
    revisado: false,
    externo_id: `lista:${m.fecha}:${Math.round(m.importe * 100)}:${clave(m.comercio)}`
  }));
}

const clave = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

/**
 * Gasto, ingreso o movida.
 *
 * El caso que importa: en el listado de una TARJETA, la plata que entra no es
 * un ingreso —nadie te deposita en la Visa— es el pago del resumen. Cargarlo
 * como ingreso infla lo que entró en el mes con plata que ya tenías, y el
 * número de "entró" deja de querer decir nada.
 *
 * Y en una cuenta, "Transf. ctas propias" o "Pago de tarjeta" tampoco son
 * gasto: la plata sigue siendo tuya, cambió de lugar.
 */
function tipoDe(m, tarjeta) {
  if (tarjeta) return 'gasto';   // los pagos del resumen ya quedaron afuera
  if (m.clase === 'transferencia') return 'transferencia';
  return m.entra ? 'ingreso' : 'gasto';
}

/** Cuántos pagos del resumen trae la lista de una tarjeta, para poder decirlo. */
export function pagosDeResumen(lista) {
  return (lista?.movimientos || []).filter(m => m.entra);
}

/**
 * Que vio cuando no pudo leer, igual que con el extracto.
 *
 * "No lo reconozco" a secas no deja arreglar nada. Si de una captura salieron
 * cinco fechas y ningun importe, el problema es el signo o el formato del
 * numero, y eso se ve en un renglon.
 */
export function revisarLista(texto) {
  const l = String(texto || '').split('\n').map(x => x.trim()).filter(Boolean);
  const tipos = l.map(queEs);
  return {
    lineas: l.length,
    fechas: tipos.filter(t => t?.que === 'fecha').length,
    importes: tipos.filter(t => t?.que === 'importe').length,
    // Las que no son ni fecha ni importe: los nombres. Si hay fechas e
    // importes pero ningun nombre, se copio solo media columna.
    nombres: tipos.filter(t => !t).length,
    muestra: l.slice(0, 6)
  };
}
