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
function leerPromosClash(html) {
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
  try {
    const r = await fetch(`https://promos.clash.com.ar/${rubro}/`, {
      // Un user-agent de navegador: con uno propio varios sitios contestan
      // una pagina de desafio en vez del contenido, y desde el telefono eso
      // se ve igual que "no hay promos".
      headers: {
        "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "es-AR,es;q=0.9"
      }
    });
    if (!r.ok) return json({ error: `clash contest\xF3 ${r.status}` }, 502);
    const html = await r.text();
    const promos = leerPromosClash(html);
    const revision = promos.length ? void 0 : {
      bytes: html.length,
      bloques: (html.match(/data-pid="/g) || []).length,
      titulo: html.match(/<title[^>]*>([^<]*)</i)?.[1]?.trim() ?? null
    };
    return json({ rubro, promos, revision, cuando: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
