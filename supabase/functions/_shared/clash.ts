// =====================================================================
// clash.ts — lee las promos de promos.clash.com.ar
//
// El sitio ya no manda las promos en el HTML: la pagina llega vacia y la
// grilla la arma el navegador con un `data.js` aparte, que define
// `window.__clashData = { P:[...], banks:[...], merchants:[...] }`. Del lado
// del servidor eso significaba recibir cero promos con la pagina entera.
//
// Asi que se lee el data.js, que ademas es un JSON: no hay que adivinar
// markup ni romperse cada vez que le cambian una clase. Cada promo trae:
//
//   id  bk  mc     identificador, quien la da, en que comercio
//   d              el porcentaje ; inst  las cuotas o la condicion
//   cap            el tope ("$20.000") ; fr  cada cuanto ("x cuenta x mes")
//   note           la letra chica: "Solo Plan Black+", "Jueves 10/09"
//   cards          con que tarjeta o billetera se paga
//   days           siete ceros y unos, lunes primero
//
// El lector viejo de HTML queda como red de seguridad: si algun dia vuelven
// a servir la grilla armada, sigue funcionando sin tocar nada.
// =====================================================================

export type PromoClash = {
  id: string;
  emisor: string;
  emisorNombre?: string;
  comercio: string;
  valor: number;
  tipo: 'reintegro' | 'descuento' | 'cuotas';
  tope: number | null;
  topePeriodo: string | null;
  dias: number[];
  fechas: string[];
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

/**
 * Las fechas sueltas que aparecen en la letra chica: "Jueves 10/09", "10/09".
 *
 * Son las promos de una vez al mes —la de combustible de Galicia es la que
 * mas importa aca— y sin esto quedaban guardadas como "todos los jueves",
 * que es cuatro veces mas seguido de lo que existen.
 *
 * El anio no lo dice nadie: se elige el que deja la fecha mas cerca de hoy,
 * porque una pagina de promos vigentes no habla de hace ocho meses.
 */
export function fechasDe(texto: string | null, ref = new Date()): string[] {
  if (!texto) return [];
  const out: string[] = [];
  for (const m of texto.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const [dia, mes] = [Number(m[1]), Number(m[2])];
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;
    const anio = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : cerca(mes, dia, ref);
    const d = new Date(anio, mes - 1, dia);
    if (d.getMonth() !== mes - 1) continue;              // 31/02 y parecidos
    const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (!out.includes(iso)) out.push(iso);
  }
  return out.sort();
}

/** El anio que deja el dia/mes mas cerca de hoy, para adelante o para atras. */
function cerca(mes: number, dia: number, ref: Date): number {
  const cand = [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1];
  return cand.reduce((mejor, a) =>
    Math.abs(new Date(a, mes - 1, dia).getTime() - ref.getTime()) <
    Math.abs(new Date(mejor, mes - 1, dia).getTime() - ref.getTime()) ? a : mejor);
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

// =====================================================================
// EL data.js, QUE ES POR DONDE VIENEN AHORA
// =====================================================================

/**
 * El objeto que sigue a `__clashData =`, recortado contando llaves.
 *
 * Con una expresion regular no alcanza: el JSON tiene llaves adentro de las
 * cadenas —nombres de promo, letra chica— y cualquier `\{[\s\S]*\}` se corta
 * en el lugar equivocado. Contar, salteando lo que este entre comillas, es
 * corto y no se equivoca.
 */
export function recorteJSON(txt: string, desde: number): string | null {
  const inicio = txt.indexOf('{', desde);
  if (inicio < 0) return null;
  let nivel = 0, enCadena = false, escapado = false;
  for (let i = inicio; i < txt.length; i++) {
    const c = txt[i];
    if (escapado) { escapado = false; continue; }
    if (c === '\\') { escapado = true; continue; }
    if (c === '"') { enCadena = !enCadena; continue; }
    if (enCadena) continue;
    if (c === '{') nivel++;
    else if (c === '}' && --nivel === 0) return txt.slice(inicio, i + 1);
  }
  return null;
}

/** "$20.000" -> 20000 */
const tope = (s: string | null | undefined) => plata(s ?? null);

/** Los dias de clash son siete 0/1 empezando el lunes; la app usa domingo = 0. */
function diasDeArreglo(days: unknown): number[] {
  if (!Array.isArray(days) || days.length !== 7) return [];
  const out: number[] = [];
  for (let i = 0; i < 7; i++) if (days[i]) out.push(A_DOMINGO_CERO[i]);
  return out.length === 7 ? [] : out.sort();
}

const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Las promos de un data.js. `rubro` solo se usa para armar el link.
 */
export function leerDatosClash(js: string, rubro = '', ref = new Date()): PromoClash[] {
  const i = js.indexOf('__clashData');
  const crudo = i < 0 ? null : recorteJSON(js, i);
  if (!crudo) return [];

  let datos: any;
  try { datos = JSON.parse(crudo); } catch { return []; }

  const nombre = (lista: any[], id: string) =>
    (lista || []).find((x: any) => x.id === id)?.name || null;

  const out: PromoClash[] = [];
  const vistos = new Set<string>();

  for (const p of datos.P ?? []) {
    if (!p || !p.id || !p.bk || !p.mc || vistos.has(p.id)) continue;

    const cuotas = typeof p.inst === 'string' ? p.inst.match(/(\d+)\s*cuotas?/i) : null;
    const valor = Number(p.d);
    const bien = Number.isFinite(valor) && valor > 0 && valor <= 100;
    // Sin porcentaje y sin cuotas no hay promo que mostrar.
    if (!bien && !cuotas) continue;

    const texto = `${p.note ?? ''} ${p.fr ?? ''} ${p.inst ?? ''}`;
    const emisorNombre = nombre(datos.banks, p.bk);
    const comercioNombre = nombre(datos.merchants, p.mc);
    const titulo = `${bien ? `${valor}% OFF` : `${cuotas![1]} cuotas sin interés`}` +
                   ` en ${comercioNombre || p.mc} con ${emisorNombre || p.bk}`;

    vistos.add(p.id);
    out.push({
      id: String(p.id),
      emisor: String(p.bk),
      emisorNombre: emisorNombre || undefined,
      // El nombre y no el identificador: 'Puma Energy' se lee, 'pumaenergy' no.
      comercio: comercioNombre || String(p.mc),
      valor: bien ? valor : Number(cuotas![1]),
      tipo: /reintegro|devoluci[oó]n/i.test(texto) ? 'reintegro' : bien ? 'descuento' : 'cuotas',
      tope: tope(p.cap),
      topePeriodo: p.fr && /x\s*mes/i.test(p.fr) ? 'mensual'
                 : p.fr && /semana/i.test(p.fr) ? 'semanal' : null,
      dias: diasDeArreglo(p.days),
      fechas: fechasDe(p.note ?? null, ref),
      medios: (p.cards ?? []).map((c: string) =>
        String(c).replace(/\.png$/i, '').replace(/[_-]+/g, ' ').toUpperCase()),
      // La condicion ("Cuenta Sueldo") importa tanto como la letra chica.
      nota: [p.inst && !cuotas ? p.inst : null, p.note].filter(Boolean).join(' · ') || null,
      url: rubro ? `https://promos.clash.com.ar/${rubro}/promocion/${slug(titulo)}-${p.id}/` : null
    });
  }
  return out;
}

// =====================================================================
// EL HTML, POR SI ALGUN DIA VUELVE A VENIR ARMADO
// =====================================================================

export function leerPromosClash(html: string, ref = new Date()): PromoClash[] {
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
      fechas: fechasDe(nota, ref),
      medios: medios(bloque),
      // La condicion ("Cuenta Sueldo", "Plan Black+") importa tanto como la
      // letra chica, y muchas promos traen una sola de las dos.
      nota: [inst && !cuotas ? inst : null, nota].filter(Boolean).join(' · ') || null,
      url
    });
  }
  return out;
}
