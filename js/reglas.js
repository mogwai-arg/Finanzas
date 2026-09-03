// =====================================================================
// reglas.js — a qué categoría va cada comercio.
//
// La tabla `reglas` existía en la base desde el principio y no la leía nadie:
// la app le preguntaba la categoría a la persona todas las veces, incluso la
// vigésima vez que cargaba el mismo supermercado.
//
// Son dos memorias distintas y las dos hacen falta:
//
//   La regla    la escribiste vos, a propósito: "coto va a Supermercado".
//               Manda siempre, aunque después cargues uno mal.
//   La historia lo que hiciste antes con ese mismo comercio. No hace falta
//               declarar nada; se aprende de cargar.
//
// Y hay una tercera, la más floja, que es adivinar por el nombre. Sirve la
// primera vez, cuando no hay ni regla ni historia, y por eso viene siempre
// acompañada de por qué lo dice: una adivinanza que no se puede discutir es
// una adivinanza que uno termina desactivando.
// =====================================================================

/** Adivinanzas por nombre, para la primera vez. Van de más específica a menos. */
const SUENA_A = [
  [/coto|carrefour|jumbo|dia\b|chino|super|verduler|almac[eé]n|disco|vea|changomas/i, 'supermercado'],
  [/ypf|shell|axion|puma|gnc|nafta|combustible/i, 'combustible'],
  [/pedidosya|rappi|mostaza|mcdonald|burger|caf[eé]|resto|pizz|helad|starbucks|bar\b/i, 'gastronom'],
  [/farmacia|farmacity|dr\.?\s|cl[ií]nica|hospital|osde|swiss|medic|dentista|[oó]ptica/i, 'salud'],
  [/edesur|edenor|metrogas|naturgy|aysa|agua|luz|gas\b|telecom|fibertel|personal|movistar|claro|flow/i, 'servicio'],
  [/netflix|spotify|disney|hbo|max\b|prime|youtube|icloud|dropbox|chatgpt|claude/i, 'suscripci'],
  [/sube|uber|cabify|didi|taxi|peaje|estacionamiento|tren|colectivo/i, 'transporte'],
  [/colegio|escuela|cuota|matr[ií]cula|[uú]til/i, 'colegio'],
  [/easy|sodimac|ferreter|pintur|mueble|hogar|blanco/i, 'hogar']
];

/**
 * Qué categoría le corresponde a un comercio, y por qué.
 *
 * Devuelve { category_id, porQue, seguro } — porQue es texto para mostrar.
 * `seguro` distingue lo que se sabe de lo que se sospecha: con lo seguro se
 * puede guardar sin preguntar, con lo otro hay que mostrarlo.
 */
export function categoriaPara(comercio, { reglas = [], transactions = [], categories = [] } = {}) {
  const nombre = String(comercio || '').trim();
  if (!nombre) return { category_id: null, porQue: null, seguro: false };
  const existe = id => categories.some(c => c.id === id);

  // 1. La regla escrita a propósito.
  const ordenadas = [...reglas].sort((a, b) =>
    (b.prioridad || 0) - (a.prioridad || 0) || (b.veces_usada || 0) - (a.veces_usada || 0));
  for (const r of ordenadas) {
    if (!r.patron || !existe(r.category_id)) continue;
    let re; try { re = new RegExp(r.patron, 'i'); } catch { continue; }
    if (re.test(nombre)) {
      return { category_id: r.category_id, regla: r, seguro: true,
               porQue: 'porque lo pediste así' };
    }
  }

  // 2. La historia: lo que hiciste antes con este mismo comercio.
  const cuenta = new Map();
  for (const t of transactions) {
    if (!t.category_id || !existe(t.category_id)) continue;
    if (!mismoComercio(t.comercio || t.descripcion, nombre)) continue;
    cuenta.set(t.category_id, (cuenta.get(t.category_id) || 0) + 1);
  }
  if (cuenta.size) {
    const [id, veces] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
    return { category_id: id, veces, seguro: veces >= 2,
             porQue: veces === 1 ? 'la última vez lo pusiste ahí'
                                 : `las últimas ${veces} veces fue ahí` };
  }

  // 3. La adivinanza por el nombre. Es la más floja y se dice que lo es.
  for (const [re, pista] of SUENA_A) {
    if (!re.test(nombre)) continue;
    const cat = categories.find(c => new RegExp(pista, 'i').test(c.nombre || ''));
    if (cat) return { category_id: cat.id, seguro: false, porQue: 'por el nombre' };
  }

  return { category_id: null, porQue: null, seguro: false };
}

/**
 * Dos nombres de comercio que son el mismo.
 *
 * "COTO CICSA 3456" y "coto" son el mismo lugar. Se compara por la primera
 * palabra larga, que es donde vive la marca: el resto —sucursal, número de
 * comprobante, la ciudad— cambia en cada compra.
 */
export function mismoComercio(a, b) {
  const k = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(p => p.length >= 3)[0] || '';
  const ka = k(a), kb = k(b);
  return !!ka && ka === kb;
}

/**
 * Guarda que este comercio va a esta categoría.
 *
 * Se guarda la marca —la primera palabra larga— y no el nombre entero: como
 * regla, "coto cicsa 3456" no vuelve a aparecer nunca igual y no serviría de
 * nada. Si ya había una regla para esa marca, se corrige en vez de sumar otra:
 * dos reglas que dicen cosas distintas del mismo comercio es peor que ninguna.
 */
export function comoRegla(comercio, category_id, reglas = []) {
  const marca = String(comercio || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(p => p.length >= 3)[0];
  if (!marca || !category_id) return null;

  const vieja = reglas.find(r => (r.patron || '').toLowerCase() === marca);
  return { ...(vieja || {}), patron: marca, category_id,
           prioridad: vieja?.prioridad ?? 10,
           veces_usada: (vieja?.veces_usada || 0) + 1 };
}
