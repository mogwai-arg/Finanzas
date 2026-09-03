// promos-clash — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/promos-clash/index.ts

// supabase/functions/_shared/comun.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
var CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// supabase/functions/_shared/clash.ts
var LETRAS = ["L", "M", "X", "J", "V", "S", "D"];
var A_DOMINGO_CERO = [1, 2, 3, 4, 5, 6, 0];
var sinTags = (s) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
var trozo = (html, clase) => {
  const m = html.match(new RegExp(`class="[^"]*\\b${clase}\\b[^"]*"[^>]*>([\\s\\S]*?)</[a-z]+>`, "i"));
  return m ? sinTags(m[1]) || null : null;
};
function plata(s) {
  if (!s) return null;
  const m = s.match(/\$\s*([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function fechasDe(texto, ref = /* @__PURE__ */ new Date()) {
  if (!texto) return [];
  const out = [];
  for (const m of texto.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const [dia, mes] = [Number(m[1]), Number(m[2])];
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;
    const anio = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : cerca(mes, dia, ref);
    const d = new Date(anio, mes - 1, dia);
    if (d.getMonth() !== mes - 1) continue;
    const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (!out.includes(iso)) out.push(iso);
  }
  return out.sort();
}
function cerca(mes, dia, ref) {
  const cand = [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1];
  return cand.reduce((mejor, a) => Math.abs(new Date(a, mes - 1, dia).getTime() - ref.getTime()) < Math.abs(new Date(mejor, mes - 1, dia).getTime() - ref.getTime()) ? a : mejor);
}
function dias(html) {
  if (/class="[^"]*\bci__alldays\b/.test(html)) return [];
  const bloque = html.match(/class="[^"]*\bci__days\b[\s\S]*?<\/div>/i);
  if (!bloque) return [];
  const spans = [...bloque[0].matchAll(/<span class="([^"]*\bdy\b[^"]*)"[^>]*>([^<]*)</g)];
  const out = [];
  for (const [, clases, letra] of spans) {
    if (!clases.includes("dy--on")) continue;
    const i = LETRAS.indexOf(letra.trim().toUpperCase());
    if (i >= 0 && !out.includes(A_DOMINGO_CERO[i])) out.push(A_DOMINGO_CERO[i]);
  }
  return out.length === 7 ? [] : out.sort();
}
function medios(html) {
  const out = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(/class="[^"]*\bci__card\b[^"]*"[^>]*\salt="([^"]+)"/g))
    out.add(sinTags(m[1]));
  for (const m of html.matchAll(/<span class=ci__card-fb>([^<]+)</g)) out.add(sinTags(m[1]));
  return [...out];
}
function porcentaje(bloque, url) {
  const txt = trozo(bloque, "ci__d");
  const n = txt ? Number(String(txt).replace(/[^\d]/g, "")) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 100) return n;
  const m = url?.match(/\/(\d{1,3})-off-/);
  const u = m ? Number(m[1]) : NaN;
  return Number.isFinite(u) && u > 0 && u <= 100 ? u : NaN;
}
function bloques(html) {
  const inicios = [...html.matchAll(/<(?:a|div|li|article)\s[^>]*\bdata-pid="[^"]+"[^>]*>/g)];
  return inicios.map((m, i) => html.slice(m.index, i + 1 < inicios.length ? inicios[i + 1].index : m.index + 4e3));
}
function recorteJSON(txt, desde) {
  const inicio = txt.indexOf("{", desde);
  if (inicio < 0) return null;
  let nivel = 0, enCadena = false, escapado = false;
  for (let i = inicio; i < txt.length; i++) {
    const c = txt[i];
    if (escapado) {
      escapado = false;
      continue;
    }
    if (c === "\\") {
      escapado = true;
      continue;
    }
    if (c === '"') {
      enCadena = !enCadena;
      continue;
    }
    if (enCadena) continue;
    if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) return txt.slice(inicio, i + 1);
  }
  return null;
}
var tope = (s) => plata(s ?? null);
function diasDeArreglo(days) {
  if (!Array.isArray(days) || days.length !== 7) return [];
  const out = [];
  for (let i = 0; i < 7; i++) if (days[i]) out.push(A_DOMINGO_CERO[i]);
  return out.length === 7 ? [] : out.sort();
}
var slug = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function revisarDatosClash(js) {
  const i = js.indexOf("__clashData");
  const crudo = i < 0 ? null : recorteJSON(js, i);
  if (!crudo) return { bytes: js.length, hay__clashData: i >= 0, error: "no pude recortar el JSON" };
  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch (e) {
    return { bytes: js.length, error: "JSON invalido: " + String(e).slice(0, 80) };
  }
  const forma = (v) => Array.isArray(v) ? `[${v.length}]` : v && typeof v === "object" ? `{${Object.keys(v).slice(0, 8).join(",")}}` : typeof v;
  const claves = {};
  for (const k of Object.keys(datos)) claves[k] = forma(datos[k]);
  let mayor = [], nombre = "";
  for (const [k, v] of Object.entries(datos)) {
    if (Array.isArray(v) && v.length > mayor.length) {
      mayor = v;
      nombre = k;
    }
  }
  const listas = Object.values(datos).filter(Array.isArray);
  const vacio = listas.length > 0 && listas.every((v) => v.length === 0);
  return {
    bytes: js.length,
    claves,
    vacio,
    listaMasLarga: nombre && mayor.length ? {
      clave: nombre,
      largo: mayor.length,
      primero: JSON.stringify(mayor[0]).slice(0, 300)
    } : null
  };
}
function leerDatosClash(js, rubro = "", ref = /* @__PURE__ */ new Date()) {
  const i = js.indexOf("__clashData");
  const crudo = i < 0 ? null : recorteJSON(js, i);
  if (!crudo) return [];
  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return [];
  }
  const nombre = (lista2, id) => (lista2 || []).find((x) => x.id === id)?.name || null;
  const out = [];
  const vistos = /* @__PURE__ */ new Set();
  const lista = Array.isArray(datos.P) ? datos.P : Object.values(datos).filter(Array.isArray).filter((v) => v.some((x) => x && x.id && x.bk && x.mc)).sort((a, b) => b.length - a.length)[0] ?? [];
  for (const p of lista) {
    if (!p || !p.id || !p.bk || !p.mc || vistos.has(p.id)) continue;
    const cuotas = typeof p.inst === "string" ? p.inst.match(/(\d+)\s*cuotas?/i) : null;
    const valor = Number(p.d);
    const bien = Number.isFinite(valor) && valor > 0 && valor <= 100;
    if (!bien && !cuotas) continue;
    const texto = `${p.note ?? ""} ${p.fr ?? ""} ${p.inst ?? ""}`;
    const emisorNombre = nombre(datos.banks, p.bk);
    const comercioNombre = nombre(datos.merchants, p.mc);
    const titulo = `${bien ? `${valor}% OFF` : `${cuotas[1]} cuotas sin inter\xE9s`} en ${comercioNombre || p.mc} con ${emisorNombre || p.bk}`;
    vistos.add(p.id);
    out.push({
      id: String(p.id),
      // El sitio ordena por este puntaje y muestra una sola por banco y
      // comercio: la mejor. Sin eso, YPF aparece seis veces seguidas.
      puntaje: Number(p.score) || 0,
      emisor: String(p.bk),
      emisorNombre: emisorNombre || void 0,
      // El nombre y no el identificador: 'Puma Energy' se lee, 'pumaenergy' no.
      comercio: comercioNombre || String(p.mc),
      valor: bien ? valor : Number(cuotas[1]),
      tipo: /reintegro|devoluci[oó]n/i.test(texto) ? "reintegro" : bien ? "descuento" : "cuotas",
      tope: tope(p.cap),
      topePeriodo: p.fr && /x\s*mes/i.test(p.fr) ? "mensual" : p.fr && /semana/i.test(p.fr) ? "semanal" : null,
      dias: diasDeArreglo(p.days),
      fechas: fechasDe(p.note ?? null, ref),
      medios: (p.cards ?? []).map((c) => String(c).replace(/\.png$/i, "").replace(/[_-]+/g, " ").toUpperCase()),
      // La condicion ("Cuenta Sueldo") importa tanto como la letra chica.
      nota: [p.inst && !cuotas ? p.inst : null, p.note].filter(Boolean).join(" \xB7 ") || null,
      url: rubro ? `https://promos.clash.com.ar/${rubro}/promocion/${slug(titulo)}-${p.id}/` : null
    });
  }
  return unaPorBancoYComercio(out);
}
function unaPorBancoYComercio(promos) {
  const mejor = /* @__PURE__ */ new Map();
  for (const p of promos) {
    const k = `${p.emisor}|${p.comercio}`;
    const y = mejor.get(k);
    if (!y || gana(p, y)) mejor.set(k, p);
  }
  return [...mejor.values()];
}
var gana = (a, b) => (a.puntaje ?? 0) !== (b.puntaje ?? 0) ? (a.puntaje ?? 0) > (b.puntaje ?? 0) : a.valor !== b.valor ? a.valor > b.valor : (a.tope ?? 0) > (b.tope ?? 0);
function leerPromosClash(html, ref = /* @__PURE__ */ new Date()) {
  const out = [];
  const vistos = /* @__PURE__ */ new Set();
  for (const bloque of bloques(html)) {
    const attr = (n) => bloque.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1] ?? null;
    const id = attr("data-pid");
    const emisor = attr("data-bk");
    const comercio = attr("data-mc");
    if (!id || !emisor || !comercio || vistos.has(id)) continue;
    const url = attr("href");
    const inst = trozo(bloque, "ci__inst");
    const valor = porcentaje(bloque, url);
    const cuotas = inst?.match(/(\d+)\s*cuotas?/i);
    if (!Number.isFinite(valor) && !cuotas) continue;
    const meta = trozo(bloque, "ci__meta");
    const nota = trozo(bloque, "ci__note");
    const texto = `${meta ?? ""} ${nota ?? ""} ${inst ?? ""}`;
    const tipo = /reintegro|devoluci[oó]n/i.test(texto) ? "reintegro" : Number.isFinite(valor) ? "descuento" : "cuotas";
    vistos.add(id);
    out.push({
      id,
      emisor,
      comercio,
      valor: Number.isFinite(valor) ? valor : Number(cuotas[1]),
      tipo,
      tope: plata(meta),
      topePeriodo: meta && /x\s*mes/i.test(meta) ? "mensual" : meta && /x\s*semana/i.test(meta) ? "semanal" : null,
      dias: dias(bloque),
      fechas: fechasDe(nota, ref),
      medios: medios(bloque),
      // La condicion ("Cuenta Sueldo", "Plan Black+") importa tanto como la
      // letra chica, y muchas promos traen una sola de las dos.
      nota: [inst && !cuotas ? inst : null, nota].filter(Boolean).join(" \xB7 ") || null,
      url
    });
  }
  return out;
}

// supabase/functions/promos-clash/index.ts
var RUBROS = {
  supermercado: "supermercados",
  combustible: "combustibles",
  gastronomia: "gastronomia",
  salud: "farmacias",
  transporte: "transportes"
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const pedido = String(body.rubro ?? url.searchParams.get("rubro") ?? "supermercado");
  const rubro = RUBROS[pedido] ?? (Object.values(RUBROS).includes(pedido) ? pedido : null);
  if (!rubro) return json({ error: `no conozco el rubro "${pedido}"`, rubros: Object.keys(RUBROS) }, 400);
  const COMO_NAVEGADOR = {
    "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
    "accept-language": "es-AR,es;q=0.9"
  };
  try {
    const datos = await fetch(
      `https://promos.clash.com.ar/${rubro}/data.js`,
      { headers: { ...COMO_NAVEGADOR, accept: "application/javascript,text/plain,*/*" } }
    );
    if (datos.ok) {
      const js = await datos.text();
      const promos2 = leerDatosClash(js, rubro);
      if (promos2.length) return json({ rubro, promos: promos2, fuente: "data.js", cuando: (/* @__PURE__ */ new Date()).toISOString() });
      var revisionDatos = revisarDatosClash(js);
    }
    const r = await fetch(
      `https://promos.clash.com.ar/${rubro}/`,
      { headers: { ...COMO_NAVEGADOR, accept: "text/html,application/xhtml+xml" } }
    );
    if (!r.ok) return json({ error: `clash contest\xF3 ${r.status}` }, 502);
    const html = await r.text();
    const promos = leerPromosClash(html);
    const revision = promos.length ? void 0 : {
      data: revisionDatos ?? "no vino",
      bytes: html.length,
      bloques: (html.match(/data-pid="/g) || []).length,
      titulo: html.match(/<title[^>]*>([^<]*)</i)?.[1]?.trim() ?? null
    };
    return json({ rubro, promos, fuente: "html", revision, cuando: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
