// =====================================================================
// frase.js — un renglón escrito a mano, convertido en movimiento.
//
// "coto 47310", "45 lucas de nafta", "café 800 ayer". Es lo que hace que
// cargar un gasto sea escribir una cosa y no llenar un formulario, y es todo
// el truco de las apps que cargan por WhatsApp: el canal no importa, lo que
// importa es no tener que elegir siete campos para anotar un café.
//
// Sin modelo de lenguaje y sin servidor: corre en el teléfono, sin conexión y
// sin costo por mensaje. La plata que uno escribe en castellano rioplatense
// tiene poquísimas formas —lucas, palos, gambas, mil— y todas caben en un
// puñado de reglas que se pueden probar.
//
// La regla de oro: si no está seguro, no inventa. Cada pieza que encuentra la
// devuelve por separado para que la pantalla pueda mostrar QUÉ entendió antes
// de guardar nada. Un gasto cargado mal es peor que uno no cargado.
// =====================================================================

/** Cuánto vale cada palabra de plata. */
const MULTIPLOS = [
  [/\b(palos?|millones?|mill[oó]n|melones?)\b/, 1e6],
  [/\b(lucas?|mil|k)\b/, 1e3],
  [/\b(gambas?)\b/, 100],
  [/\b(mangos?|pesos?|ars)\b/, 1]
];

const DOLARES = /\b(d[oó]lares?|d[oó]lar|usd|u\$s|dolar|verdes?)\b/;

const DIAS = ['domingo', 'lunes', 'martes', 'mi[eé]rcoles', 'jueves', 'viernes', 's[aá]bado'];

/** Palabras que no son ni el monto ni el comercio: sacan ruido del nombre. */
//
// Los bordes van con \p{L} y no con \b: en JavaScript \b es de la época del
// ASCII y no considera letra a la é, así que "\bcobré\b" nunca calza y el
// verbo quedaba pegado al nombre del comercio ("cobré aysa").
const RELLENO = new RegExp('(?<![\\p{L}])(' + [
  'gaste', 'gasté', 'pague', 'pagué', 'compre', 'compré', 'me', 'salio', 'salió',
  'costo', 'costó', 'cobre', 'cobré', 'cobraron', 'pagaron', 'entro', 'entró',
  'puse', 'pase', 'pasé', 'transferi', 'transferí', 'movi', 'moví', 'mande', 'mandé',
  'en', 'de', 'del', 'con', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'por', 'para', 'al', 'a', 'y', 'lo', 'que', 'plata', 'guita'
].join('|') + ')(?![\\p{L}])', 'giu');

const sinTildes = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Lee la frase. Devuelve lo que entendió, pieza por pieza, o null si no
 * encontró un monto —sin monto no hay movimiento y adivinarlo sería inventar.
 */
export function leerFrase(texto, { cuentas = [], hoy = new Date() } = {}) {
  const original = String(texto || '').trim();
  if (!original) return null;
  let resto = ' ' + original.toLowerCase() + ' ';
  const entendido = [];

  // El orden importa: cada pieza que se saca deja menos números sueltos para
  // confundir con el monto, que es lo último que se busca.

  // 1. Cuotas. "en 6 cuotas" tiene un número que no es plata.
  let cuotas = 1;
  const mCuotas = resto.match(/\b(?:en\s+)?(\d{1,2})\s*cuotas?\b/);
  if (mCuotas) {
    cuotas = Number(mCuotas[1]);
    resto = resto.replace(mCuotas[0], ' ');
    entendido.push(`${cuotas} cuotas`);
  }

  // 2. Fecha.
  const f = sacarFecha(resto, hoy);
  resto = f.resto;
  if (f.etiqueta) entendido.push(f.etiqueta);

  // 3. Cuenta: "con galicia", "en efectivo", "con la visa".
  const c = sacarCuenta(resto, cuentas);
  resto = c.resto;
  if (c.cuenta) entendido.push(c.cuenta.nombre);

  // 4. Moneda.
  const enDolares = DOLARES.test(sinTildes(resto));
  if (enDolares) resto = sinTildes(resto).replace(DOLARES, ' ');

  // 5. El monto, con lo que quedó.
  const m = sacarMonto(resto);
  if (!m) return null;
  resto = m.resto;

  // 6. Tipo: lo dice el verbo, y por omisión es un gasto, que es lo que uno
  //    carga noventa y nueve veces de cada cien.
  const tipo = /\b(cobr[eé]|cobraron|me pagaron|entr[oó]|ingres[oó]|sueldo|aguinaldo)\b/
    .test(sinTildes(original.toLowerCase())) ? 'ingreso'
    : /\b(pas[eé]|transfer[ií]|mov[ií]|mand[eé])\b/.test(sinTildes(original.toLowerCase()))
      ? 'transferencia' : 'gasto';

  const comercio = limpiar(resto, original);

  return {
    tipo,
    monto: m.monto,
    moneda: enDolares ? 'USD' : 'ARS',
    comercio,
    descripcion: comercio,
    fecha: f.fecha,
    cuotas,
    account_id: c.cuenta?.id || null,
    // Lo que quedó sin usar de la frase. Sirve para decir "esto no lo
    // entendí" en vez de tragárselo en silencio.
    entendido,
    // Sin nombre no se puede pedir que uno confíe: la pantalla lo va a pedir.
    completo: !!comercio
  };
}

/**
 * El monto.
 *
 * "45 lucas" son 45.000 y "3,5 palos" son 3.500.000. La palabra multiplica al
 * número que tiene delante, no a toda la frase: en "2 palos de coto 500" el
 * 500 no es parte del monto.
 */
function sacarMonto(texto) {
  const t = sinTildes(texto);

  // Primero con palabra: es la forma menos ambigua y la que más se escribe.
  for (const [re, mult] of MULTIPLOS) {
    const conNumero = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${re.source.replace(/\\b/g, '')}`, 'i');
    const m = t.match(conNumero);
    if (!m) continue;
    const base = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(base)) continue;
    return { monto: redondear(base * mult), resto: texto.replace(new RegExp(escapar(m[0]), 'i'), ' ') };
  }

  // Y si no, un número a secas: "coto 47310", "$ 47.310,50".
  const m = t.match(/\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const monto = aNumero(m[1]);
  if (!(monto > 0)) return null;
  return { monto, resto: texto.replace(new RegExp('\\$?\\s*' + escapar(m[1])), ' ') };
}

/**
 * Un número escrito a mano.
 *
 * Misma regla que en texto.js: si hay dos separadores manda el último; si hay
 * uno solo seguido de exactamente dos dígitos hasta el final es un decimal,
 * y si lo siguen tres es de miles. '1.234' son mil doscientos treinta y
 * cuatro, no uno con doscientos treinta y cuatro.
 */
function aNumero(s) {
  const t = String(s).trim();
  const punto = t.lastIndexOf('.'), coma = t.lastIndexOf(',');
  const ult = Math.max(punto, coma);
  if (ult < 0) return Number(t);
  const dec = t.length - ult - 1;
  if (dec === 3 && (punto < 0 || coma < 0)) return Number(t.replace(/[.,]/g, ''));
  return Number(t.slice(0, ult).replace(/[.,]/g, '') + '.' + t.slice(ult + 1));
}

/** La fecha, y la etiqueta para poder decirla. */
function sacarFecha(texto, hoy) {
  const t = sinTildes(texto);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const correr = n => { const d = new Date(hoy); d.setDate(d.getDate() - n); return d; };

  let m;
  if ((m = t.match(/\banteayer\b/)))
    return { fecha: iso(correr(2)), resto: quitar(texto, m[0]), etiqueta: 'anteayer' };
  if ((m = t.match(/\bayer\b/)))
    return { fecha: iso(correr(1)), resto: quitar(texto, m[0]), etiqueta: 'ayer' };
  if ((m = t.match(/\bhoy\b/)))
    return { fecha: iso(hoy), resto: quitar(texto, m[0]), etiqueta: null };

  // "el lunes": el último que pasó, nunca uno que todavía no llegó. Nadie
  // carga un gasto del futuro.
  for (let i = 0; i < 7; i++) {
    if (!(m = t.match(new RegExp(`\\b(?:el\\s+)?${DIAS[i]}\\b`)))) continue;
    let atras = (hoy.getDay() - i + 7) % 7;
    if (atras === 0) atras = 7;
    return { fecha: iso(correr(atras)), resto: quitar(texto, m[0]),
             etiqueta: m[0].trim().replace(/^el\s+/, '') };
  }

  // "15/8" o "15/8/26". Sin año es de este año, salvo que caiga adelante.
  if ((m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    const d = Number(m[1]), mes = Number(m[2]);
    let anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : hoy.getFullYear();
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
      let fecha = new Date(anio, mes - 1, d);
      if (!m[3] && fecha > hoy) fecha = new Date(anio - 1, mes - 1, d);
      return { fecha: iso(fecha), resto: quitar(texto, m[0]),
               etiqueta: `${d}/${mes}` };
    }
  }

  // "el 15": un día de este mes, o del anterior si todavía no llegó.
  if ((m = t.match(/\bel\s+(\d{1,2})\b/))) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) {
      let fecha = new Date(hoy.getFullYear(), hoy.getMonth(), d);
      if (fecha > hoy) fecha = new Date(hoy.getFullYear(), hoy.getMonth() - 1, d);
      return { fecha: iso(fecha), resto: quitar(texto, m[0]), etiqueta: `el ${d}` };
    }
  }

  return { fecha: iso(hoy), resto: texto, etiqueta: null };
}

/**
 * De qué cuenta salió.
 *
 * Se busca por el nombre que uno le puso y también por cómo la llama: nadie
 * escribe "Galicia Visa", escribe "visa". Gana la coincidencia más larga, así
 * "galicia visa" no se lleva puesta a "galicia".
 */
function sacarCuenta(texto, cuentas) {
  const t = sinTildes(texto);
  let mejor = null, cual = null;
  for (const a of cuentas) {
    if (a.activo === false) continue;
    for (const alias of aliasDe(a)) {
      const re = new RegExp(`\\b${escapar(alias)}\\b`, 'i');
      if (!re.test(t)) continue;
      if (!mejor || alias.length > mejor.length) { mejor = alias; cual = a; }
    }
  }
  if (!cual) return { cuenta: null, resto: texto };
  return { cuenta: cual, resto: quitar(texto, mejor) };
}

/** Los nombres con los que uno puede nombrar una cuenta. */
function aliasDe(cuenta) {
  const n = sinTildes(String(cuenta.nombre || '').toLowerCase());
  const out = [n, ...n.split(/\s+/).filter(p => p.length >= 4)];
  if (/efectivo/.test(n)) out.push('efvo', 'cash');
  if (/mercado ?pago/.test(n)) out.push('mp', 'mercadopago');
  return [...new Set(out.filter(Boolean))].sort((a, b) => b.length - a.length);
}

/**
 * Saca del nombre el relleno y le arregla las mayúsculas.
 *
 * La frase se pasa a minúscula para poder buscar en ella, así que acá el
 * nombre viene aplastado y hay que ir a buscar cómo lo escribió la persona:
 * "YPF" tiene que quedar "YPF" y no "Ypf". Palabra por palabra contra el
 * original, y si la escribió toda en minúscula —que es lo normal apurado— se
 * le pone la inicial, porque "$ 47.310 en coto" se lee descuidado.
 */
function limpiar(resto, original = '') {
  const t = resto.replace(RELLENO, ' ').replace(/[^\p{L}\p{N}\s.&'-]/gu, ' ')
    .replace(/\s{2,}/g, ' ').trim();
  if (!t) return '';
  const palabras = String(original).split(/\s+/);
  return t.split(' ').map(p => {
    const suya = palabras.find(x => x.toLowerCase().replace(/[^\p{L}\p{N}.&'-]/gu, '') === p);
    if (suya && suya !== suya.toLowerCase()) return suya.replace(/[^\p{L}\p{N}.&'-]/gu, '');
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' ');
}

const escapar = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const quitar = (texto, trozo) => texto.replace(new RegExp(escapar(trozo), 'i'), ' ');
const redondear = n => Math.round(n * 100) / 100;
