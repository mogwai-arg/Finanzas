// =====================================================================
// correccion.js — "ay, la pagué con efectivo".
//
// Lo que hace que un chat sea un chat y no una ventanita de comandos: lo que
// decís ahora se entiende en el contexto de lo que dijiste recién. Sin esto,
// corregir obliga a deshacer y escribir todo de nuevo, y ahí ya conviene el
// formulario.
//
// Es también lo que hace usable el dictado. Hablando uno se corrige todo el
// tiempo —"comí empanadas... ay no, la pagué con efectivo"— y esas segundas
// frases nunca traen el monto.
//
// La regla para no romper nada: una frase con monto es un movimiento nuevo,
// salvo que arranque diciendo que es una corrección ("no, eran 8000"). Una
// frase sin monto solo puede ser una corrección, porque un movimiento sin
// monto no existe.
// =====================================================================
import { sacarCuenta, sacarFecha, sacarMonto, sinTildes } from './frase.js';

/** "no", "en realidad", "era": lo que avisa que se viene una corrección. */
export const MARCA_CORRECCION =
  /^\s*(no|nop|ay|uy|ah|pará|para|perd[oó]n|mejor|en realidad|era|eran|fue|fueron|corregí|corregi|cambi[aá])\b/i;

const BORRAR = /(?<![\p{L}])(borra(lo|r)?|borr[aá](lo)?|elimin[aá]?(lo)?|deshac[eé]?(lo)?|anul[aá]?(lo)?|cancel[aá]?(lo)?|sacalo|olvidalo)(?![\p{L}])/iu;

/**
 * Lee una frase como cambio sobre el movimiento anterior.
 *
 * Devuelve { campos, dicho } —lo que hay que guardar y cómo contarlo— o null
 * si no reconoció nada. Null es una respuesta válida y no un error: mejor
 * decir "eso no lo entendí" que aplicar un cambio que nadie pidió.
 */
export function leerCorreccion(texto, { cuentas = [], categorias = [], hoy = new Date() } = {}) {
  const dicho = String(texto || '').trim();
  if (!dicho) return null;

  if (BORRAR.test(sinTildes(dicho))) return { borrar: true, dicho: 'Listo, lo borré.' };

  const campos = {}; const partes = [];
  let resto = ' ' + dicho.toLowerCase() + ' ';

  // La cuenta. Es la corrección más común de todas: uno anota el gasto y se
  // acuerda después de con qué lo pagó.
  const c = sacarCuenta(resto, cuentas);
  if (c.cuenta) {
    campos.account_id = c.cuenta.id;
    partes.push(c.cuenta.nombre);
    resto = c.resto;
  }

  // La categoría, por su nombre. Es lo que hace que se pueda confirmar
  // hablando: decir "gastronomía" tiene que valer lo mismo que tocar el botón.
  const cat = queCategoria(resto, categorias);
  if (cat) {
    campos.category_id = cat.id;
    partes.push(cat.nombre);
    resto = resto.replace(new RegExp(escapar(cat.calzo), 'i'), ' ');
  }

  // Las cuotas.
  const mc = resto.match(/(?:en\s+)?(\d{1,2})\s*cuotas?\b/);
  if (mc) { campos.cuotas = Number(mc[1]); partes.push(`${mc[1]} cuotas`); resto = resto.replace(mc[0], ' '); }

  // La fecha, solo si la nombró: sacarFecha devuelve hoy cuando no encuentra
  // nada, y "hoy" como corrección movería la fecha de un gasto de la semana
  // pasada sin que nadie lo pidiera.
  const f = sacarFecha(resto, hoy);
  if (f.etiqueta) { campos.fecha = f.fecha; partes.push(f.etiqueta); resto = f.resto; }

  // El monto, solo con permiso explícito. Un número suelto en una corrección
  // es casi siempre parte de otra cosa; cambiar la plata por las dudas es el
  // error que no se perdona.
  if (MARCA_CORRECCION.test(dicho) || /\b(son|es|sale|salió|salio)\b/i.test(sinTildes(dicho))) {
    const m = sacarMonto(resto);
    if (m) { campos.monto = m.monto; partes.push(`$ ${m.monto}`); }
  }

  if (!Object.keys(campos).length) return null;
  return { campos, partes, dicho };
}

/**
 * Qué categoría nombró, si nombró alguna.
 *
 * Por el nombre completo y también por la primera palabra: la categoría se
 * llama "Combustible / Transporte" y nadie va a decir eso entero, ni escrito
 * ni mucho menos hablando.
 */
export function queCategoria(texto, categorias = []) {
  const t = sinTildes(String(texto).toLowerCase());
  let mejor = null;
  for (const c of categorias) {
    const nombre = sinTildes(String(c.nombre || '').toLowerCase());
    if (!nombre) continue;
    for (const alias of [nombre, ...nombre.split(/[\s/]+/).filter(p => p.length >= 4)]) {
      if (!new RegExp(`(?<![\\p{L}])${escapar(alias)}(?![\\p{L}])`, 'iu').test(t)) continue;
      // Gana el nombre más largo: "combustible / transporte" antes que
      // "transporte" suelto, si las dos calzan.
      if (!mejor || alias.length > mejor.calzo.length) mejor = { ...c, calzo: alias };
    }
  }
  return mejor;
}

/**
 * Una categoría que todavía no existe.
 *
 * Decir "ponelo en mascotas" cuando no hay Mascotas tiene una sola respuesta
 * razonable: crearla. Pedir que la persona salga del chat, vaya a Ajustes, la
 * cree y vuelva es exactamente la fricción que este chat viene a sacar.
 *
 * Lo delicado es no llenar la lista de categorías de basura, porque esa lista
 * es la que arma el gráfico de en qué se fue. Tres candados:
 *
 *   Tiene que sonar a que la nombró: "ponelo en X", "categoría X", o la
 *   palabra sola, que es cómo se contesta la pregunta de "¿de qué categoría
 *   es?".
 *   Tiene que parecer un nombre: una o dos palabras, solo letras.
 *   No puede ser un adjetivo. "es carísimo" es una queja, no una categoría, y
 *   dictando aparecen todo el tiempo.
 *
 * Y arriba de los tres, se puede deshacer en el mismo renglón.
 */
const NOMBRA_CATEGORIA =
  /(?:^|\s)(?:categor[ií]a|ponelo en|pon[eé] en|meselo en|metelo en|guardalo en|va a|es|era|son|ponelo como)\s+(.{3,24})$/i;

// Lo que uno dice de un gasto y no es una categoría. Dictando salen solos.
const NO_ES_CATEGORIA = new RegExp('^(' + [
  'caro', 'carisimo', 'car[ií]simo', 'cara', 'barato', 'mucho', 'poco', 'todo', 'nada',
  'eso', 'esa', 'ese', 'otra', 'otro', 'igual', 'raro', 'lo mismo', 'mio', 'm[ií]o',
  'para mi', 'un regalo', 'regalo', 'urgente', 'importante', 'necesario', 'al pedo',
  'si', 's[ií]', 'no', 'bueno', 'malo', 'ok', 'listo', 'gasto', 'ingreso', 'plata'
].join('|') + ')$', 'iu');

export function categoriaNueva(texto, categorias = []) {
  const dicho = String(texto || '').trim().replace(/[.!?]+$/, '');
  if (!dicho) return null;

  // La palabra sola cuenta: es cómo se contesta "¿de qué categoría es?".
  const m = dicho.match(NOMBRA_CATEGORIA);
  const crudo = (m ? m[1] : dicho).trim().replace(/^(la|el|los|las|un|una)\s+/i, '');

  const palabras = crudo.split(/\s+/);
  if (palabras.length > 2) return null;
  if (!/^[\p{L}][\p{L}\s]{2,23}$/u.test(crudo)) return null;
  if (NO_ES_CATEGORIA.test(sinTildes(crudo))) return null;

  // Si ya existe no hay nada que crear: de eso se ocupa queCategoria.
  const igual = sinTildes(crudo.toLowerCase());
  if (categorias.some(c => sinTildes(String(c.nombre || '').toLowerCase()) === igual)) return null;

  return crudo.replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

const escapar = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
