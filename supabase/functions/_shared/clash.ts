// =====================================================================
// clash.ts — lee las promos de promos.clash.com.ar
//
// El sitio arma las paginas del lado del servidor: no hay JSON que pedir,
// pero tampoco hace falta ejecutar JavaScript. Cada promo es un <a class="ci">
// con todo lo que importa en atributos y en clases estables:
//
//   data-bk   quien la da: galicia, mercadopago, modo, personalpay...
//   data-mc   el comercio: ypf, shell, axion...
//   data-pid  el identificador, que sirve para no repetirlas
//   .ci__d    el porcentaje
//   .ci__meta el tope y cada cuanto se renueva
//   .ci__note la letra chica: "solo con Plan Black+", "tarjeta fisica"
//   .ci__days siete letras, las que aplican con la clase dy--on
//
// Se lee con expresiones y no con un arbol DOM porque del otro lado corre
// Deno sin navegador, y porque atarse a la anidacion exacta seria mas fragil
// que atarse a estas clases.
// =====================================================================

export type PromoClash = {
  id: string;
  emisor: string;
  comercio: string;
  valor: number;
  tipo: 'reintegro' | 'descuento';
  tope: number | null;
  topePeriodo: string | null;
  dias: number[];
  nota: string | null;
  url: string | null;
};

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];   // lunes a domingo
const A_DOMINGO_CERO = [1, 2, 3, 4, 5, 6, 0];          // como los guarda la app

const sinTags = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

const trozo = (html: string, clase: string) => {
  const m = html.match(new RegExp(`class="${clase}"[^>]*>([\\s\\S]*?)</(?:span|div)>`, 'i'));
  return m ? sinTags(m[1]) : null;
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
  const bloque = html.match(/class="ci__days"[\s\S]*?<\/div>/i);
  if (!bloque) return [];
  const spans = [...bloque[0].matchAll(/<span class="dy([^"]*)"[^>]*>([^<]*)</g)];
  const out: number[] = [];
  for (const [, clases, letra] of spans) {
    if (!clases.includes('dy--on')) continue;
    const i = LETRAS.indexOf(letra.trim().toUpperCase());
    if (i >= 0) out.push(A_DOMINGO_CERO[i]);
  }
  // Los siete marcados es lo mismo que "todos los dias", y la app lo escribe
  // con la lista vacia.
  return out.length === 7 ? [] : out.sort();
}

export function leerPromosClash(html: string): PromoClash[] {
  const out: PromoClash[] = [];
  const vistos = new Set<string>();

  for (const m of html.matchAll(/<a class="ci ci--link"[\s\S]*?<\/a>/g)) {
    const bloque = m[0];
    const attr = (n: string) => bloque.match(new RegExp(`${n}="([^"]*)"`))?.[1] ?? null;

    const id = attr('data-pid');
    const emisor = attr('data-bk');
    const comercio = attr('data-mc');
    if (!id || !emisor || !comercio || vistos.has(id)) continue;

    const pct = trozo(bloque, 'ci__d');
    const valor = pct ? Number(String(pct).replace(/[^\d]/g, '')) : NaN;
    if (!Number.isFinite(valor) || valor <= 0) continue;

    const meta = trozo(bloque, 'ci__meta');
    const nota = trozo(bloque, 'ci__note');
    // El sitio dice "off" para casi todo; solo marca reintegro cuando lo es.
    const texto = `${meta ?? ''} ${nota ?? ''}`;
    const tipo = /reintegro|devoluci[oó]n/i.test(texto) ? 'reintegro' : 'descuento';

    vistos.add(id);
    out.push({
      id, emisor, comercio, valor, tipo,
      tope: plata(meta),
      topePeriodo: meta && /x mes/i.test(meta) ? 'mensual'
                 : meta && /x semana/i.test(meta) ? 'semanal' : null,
      dias: dias(bloque),
      nota: nota || null,
      url: attr('href')
    });
  }
  return out;
}
