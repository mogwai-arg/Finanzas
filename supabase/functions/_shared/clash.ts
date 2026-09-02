// =====================================================================
// clash.ts — lee las promos de promos.clash.com.ar
//
// El sitio arma las paginas del lado del servidor: no hay JSON que pedir,
// pero tampoco hace falta ejecutar JavaScript. Cada promo es un bloque con
// todo lo que importa en atributos y en clases estables:
//
//   data-bk   quien la da: galicia, mercadopago, modo, personalpay...
//   data-mc   el comercio: ypf, shell, axion...
//   data-pid  el identificador, que sirve para no repetirlas
//   .ci__d    el porcentaje
//   .ci__inst las cuotas, o la condicion ("Cuenta Sueldo")
//   .ci__meta el tope y cada cuanto se renueva
//   .ci__note la letra chica: "solo con Plan Black+", "Jueves 10/09"
//   .ci__days siete letras, las que aplican con la clase dy--on
//
// Se lee con expresiones y no con un arbol DOM porque del otro lado corre
// Deno sin navegador. Pero se lee por TOKEN de clase y no por el atributo
// entero: la primera version pedia class="ci__d" exacto y se comia las
// promos con class="ci__d ci__d--s", que son justo las de Galicia. Lo mismo
// con el bloque: pedia <a class="ci ci--link"> y las que no son link, o las
// que el sitio arme como <div>, quedaban afuera.
// =====================================================================

export type PromoClash = {
  id: string;
  emisor: string;
  comercio: string;
  valor: number;
  tipo: 'reintegro' | 'descuento' | 'cuotas';
  tope: number | null;
  topePeriodo: string | null;
  dias: number[];
  medios: string[];
  nota: string | null;
  url: string | null;
};

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];   // lunes a domingo
const A_DOMINGO_CERO = [1, 2, 3, 4, 5, 6, 0];          // como los guarda la app

const sinTags = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** El contenido del primer elemento cuya lista de clases incluya `clase`. */
const trozo = (html: string, clase: string) => {
  const m = html.match(new RegExp(`class="[^"]*\\b${clase}\\b[^"]*"[^>]*>([\\s\\S]*?)</[a-z]+>`, 'i'));
  return m ? sinTags(m[1]) || null : null;
};

/** "$100.000" -> 100000 ; "$5.000" -> 5000 */
function plata(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\$\s*([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Los dias marcados con dy--on, en el mismo formato que usa la app. */
function dias(html: string): number[] {
  // ci__alldays es como el sitio escribe "todos los dias", y la app eso lo
  // guarda con la lista vacia.
  if (/class="[^"]*\bci__alldays\b/.test(html)) return [];
  const bloque = html.match(/class="[^"]*\bci__days\b[\s\S]*?<\/div>/i);
  if (!bloque) return [];
  const spans = [...bloque[0].matchAll(/<span class="([^"]*\bdy\b[^"]*)"[^>]*>([^<]*)</g)];
  const out: number[] = [];
  for (const [, clases, letra] of spans) {
    if (!clases.includes('dy--on')) continue;
    const i = LETRAS.indexOf(letra.trim().toUpperCase());
    if (i >= 0 && !out.includes(A_DOMINGO_CERO[i])) out.push(A_DOMINGO_CERO[i]);
  }
  return out.length === 7 ? [] : out.sort();
}

/** Las tarjetas y billeteras con las que aplica, del alt de cada logo. */
function medios(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="[^"]*\bci__card\b[^"]*"[^>]*\salt="([^"]+)"/g))
    out.add(sinTags(m[1]));
  for (const m of html.matchAll(/<span class=ci__card-fb>([^<]+)</g)) out.add(sinTags(m[1]));
  return [...out];
}

/**
 * El porcentaje. Del bloque .ci__d, y si no esta, del propio link:
 * .../promocion/25-off-en-ypf-con-galicia-m_galicia_ypf_.../
 */
function porcentaje(bloque: string, url: string | null): number {
  const txt = trozo(bloque, 'ci__d');
  const n = txt ? Number(String(txt).replace(/[^\d]/g, '')) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  const m = url?.match(/\/(\d{1,3})-off-/);
  const u = m ? Number(m[1]) : NaN;
  return Number.isFinite(u) && u > 0 && u <= 100 ? u : NaN;
}

/**
 * Cada promo, sea <a> o <div>, del comienzo de su bloque al comienzo del
 * siguiente. Cortar por el tag de cierre seria mas prolijo pero se rompe con
 * cualquier anidacion; cortar entre promos no.
 */
function bloques(html: string): string[] {
  const inicios = [...html.matchAll(/<(?:a|div|li|article)\s[^>]*\bdata-pid="[^"]+"[^>]*>/g)];
  return inicios.map((m, i) =>
    html.slice(m.index!, i + 1 < inicios.length ? inicios[i + 1].index! : m.index! + 4000));
}

export function leerPromosClash(html: string): PromoClash[] {
  const out: PromoClash[] = [];
  const vistos = new Set<string>();

  for (const bloque of bloques(html)) {
    const attr = (n: string) => bloque.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] ?? null;

    const id = attr('data-pid');
    const emisor = attr('data-bk');
    const comercio = attr('data-mc');
    if (!id || !emisor || !comercio || vistos.has(id)) continue;

    const url = attr('href');
    const inst = trozo(bloque, 'ci__inst');
    const valor = porcentaje(bloque, url);
    const cuotas = inst?.match(/(\d+)\s*cuotas?/i);
    // Sin porcentaje y sin cuotas no hay promo que mostrar: es una tarjeta
    // vacia de las que el sitio usa para rellenar la grilla.
    if (!Number.isFinite(valor) && !cuotas) continue;

    const meta = trozo(bloque, 'ci__meta');
    const nota = trozo(bloque, 'ci__note');
    // El sitio dice "off" para casi todo; solo marca reintegro cuando lo es.
    const texto = `${meta ?? ''} ${nota ?? ''} ${inst ?? ''}`;
    const tipo = /reintegro|devoluci[oó]n/i.test(texto) ? 'reintegro'
               : Number.isFinite(valor) ? 'descuento' : 'cuotas';

    vistos.add(id);
    out.push({
      id, emisor, comercio,
      valor: Number.isFinite(valor) ? valor : Number(cuotas![1]),
      tipo,
      tope: plata(meta),
      topePeriodo: meta && /x\s*mes/i.test(meta) ? 'mensual'
                 : meta && /x\s*semana/i.test(meta) ? 'semanal' : null,
      dias: dias(bloque),
      medios: medios(bloque),
      // La condicion ("Cuenta Sueldo", "Plan Black+") importa tanto como la
      // letra chica, y muchas promos traen una sola de las dos.
      nota: [inst && !cuotas ? inst : null, nota].filter(Boolean).join(' · ') || null,
      url
    });
  }
  return out;
}
