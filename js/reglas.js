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
  // Lo que uno come, que dictando aparece más que el nombre del lugar.
  [/empanada|milanesa|asado|choripan|sandwich|s[aá]ngu|almuerzo|cena|desayuno|merienda|hamburguesa|sushi|parrilla|panader|cerveza|vino|medialuna|factura de/i, 'gastronom'],
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
export function categoriaPara(comercio, { reglas = [], transactions = [], categories = [],
                                         descripcion = '' } = {}) {
  const nombre = String(comercio || '').trim();
  if (!nombre) return { category_id: null, porQue: null, seguro: false };
  const existe = id => categories.some(c => c.id === id);

  // 1. La regla escrita a propósito.
  for (const r of porFuerza(reglas)) {
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
  //
  // Primero por QUÉ compraste y después por DÓNDE: "comí empanadas en la YPF"
  // es gastronomía, no combustible. El lugar donde parás dice menos que la
  // cosa que compraste, y confundirlos manda la comida a la categoría de la
  // nafta todos los meses.
  for (const texto of [String(descripcion || '').trim(), nombre]) {
    if (!texto) continue;
    for (const [re, pista] of SUENA_A) {
      if (!re.test(texto)) continue;
      const cat = categories.find(c => new RegExp(pista, 'i').test(c.nombre || ''));
      if (cat) return { category_id: cat.id, seguro: false, porQue: 'por el nombre' };
    }
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
/**
 * La regla que le toca a este comercio, si hay alguna.
 *
 * Las reglas son expresiones, no nombres: una sola dice "ypf|shell|axion".
 * Compararlas por igualdad —"¿hay una regla que se llame ypf?"— no encuentra
 * ninguna y hace creer que el comercio está libre, cuando en realidad ya
 * tiene dueño.
 */
export function reglaQueAplica(comercio, reglas = []) {
  const nombre = String(comercio || '').trim();
  if (!nombre) return null;
  for (const r of porFuerza(reglas)) {
    if (!r.patron) continue;
    let re; try { re = new RegExp(r.patron, 'i'); } catch { continue; }
    if (re.test(nombre)) return r;
  }
  return null;
}

/** La regla que ya manda sobre este comercio y dice otra cosa. */
export function reglaQueChoca(comercio, category_id, reglas = []) {
  const r = reglaQueAplica(comercio, reglas);
  return r && r.category_id !== category_id ? r : null;
}

/** La marca: la primera palabra larga, que es donde vive el nombre del lugar. */
export function marcaDe(comercio) {
  return String(comercio || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(p => p.length >= 3)[0] || '';
}

const porFuerza = reglas => [...(reglas || [])].sort((a, b) =>
  (b.prioridad || 0) - (a.prioridad || 0) || (b.veces_usada || 0) - (a.veces_usada || 0));

export function comoRegla(comercio, category_id, reglas = []) {
  const marca = marcaDe(comercio);
  if (!marca || !category_id) return null;

  // Si ya había una regla escrita para esta misma marca, se corrige: dos
  // reglas que dicen cosas distintas del mismo comercio es peor que ninguna.
  const propia = (reglas || []).find(r => (r.patron || '').toLowerCase() === marca);
  if (propia) {
    return { ...propia, patron: marca, category_id,
             prioridad: propia.prioridad ?? 10,
             veces_usada: (propia.veces_usada || 0) + 1 };
  }

  // Si la que manda es más ancha —"ypf|shell|axion"— no se la toca: cambiarla
  // movería también Shell y Axion, que nadie nombró. Se le gana con una más
  // específica y de mayor prioridad, y las otras siguen como estaban.
  const ancha = reglaQueAplica(comercio, reglas);
  return { patron: marca, category_id, veces_usada: 1,
           prioridad: ancha ? (ancha.prioridad || 0) + 1 : 10 };
}

/**
 * Los gastos sin categoria, agrupados por comercio.
 *
 * Es la pieza que faltaba para poder categorizar de a muchos. Los seis COTO
 * de un resumen son una fila, no seis: de a uno son cuarenta toques y nadie
 * los da, y por eso el grafico de "en que se fue" tiene un pozo enorme
 * llamado "sin categoria" que lo vuelve inutil.
 *
 * Cada grupo trae la sugerencia y de donde sale, para poder aceptarla o
 * discutirla sin abrir nada.
 */
export function sinCategoria(txs, estado = {}, { desde = null } = {}) {
  const { reglas = [], transactions = [], categories = [] } = estado;
  const por = new Map();

  for (const t of txs || []) {
    if (t.tipo !== 'gasto' || t.category_id) continue;
    if (desde && String(t.fecha).slice(0, 10) < desde) continue;
    const nombre = (t.comercio || t.descripcion || '').trim();
    if (!nombre) continue;
    const clave = marcaDe(nombre) || nombre.toLowerCase();
    const g = por.get(clave) || { clave, nombre, txs: [], total: 0 };
    // El nombre mas corto del grupo: "COTO" se lee mejor que
    // "COTO CICSA 3456 BUENOS AIRES".
    if (nombre.length < g.nombre.length) g.nombre = nombre;
    g.txs.push(t);
    g.total = Math.round((g.total + (Number(t.monto) || 0)) * 100) / 100;
    por.set(clave, g);
  }

  return [...por.values()]
    .map(g => {
      const s = categoriaPara(g.nombre, { reglas, transactions, categories });
      return { ...g, cuantos: g.txs.length, sugerida: s.category_id, porQue: s.porQue,
               seguro: s.seguro,
               // El ultimo, para poder decir "el 12 de agosto" y ubicarlo.
               ultimo: g.txs.map(t => String(t.fecha).slice(0, 10)).sort().pop() };
    })
    // Por plata y no por cantidad: veinte cafes de mil pesos mueven menos el
    // grafico que una compra de doscientos mil.
    .sort((a, b) => b.total - a.total);
}
