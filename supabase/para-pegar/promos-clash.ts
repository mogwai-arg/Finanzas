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
var sinTags = (s) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
var trozo = (html, clase) => {
  const m = html.match(new RegExp(`class="${clase}"[^>]*>([\\s\\S]*?)</(?:span|div)>`, "i"));
  return m ? sinTags(m[1]) : null;
};
function plata(s) {
  if (!s) return null;
  const m = s.match(/\$\s*([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function dias(html) {
  const bloque = html.match(/class="ci__days"[\s\S]*?<\/div>/i);
  if (!bloque) return [];
  const spans = [...bloque[0].matchAll(/<span class="dy([^"]*)"[^>]*>([^<]*)</g)];
  const out = [];
  for (const [, clases, letra] of spans) {
    if (!clases.includes("dy--on")) continue;
    const i = LETRAS.indexOf(letra.trim().toUpperCase());
    if (i >= 0) out.push(A_DOMINGO_CERO[i]);
  }
  return out.length === 7 ? [] : out.sort();
}
function leerPromosClash(html) {
  const out = [];
  const vistos = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(/<a class="ci ci--link"[\s\S]*?<\/a>/g)) {
    const bloque = m[0];
    const attr = (n) => bloque.match(new RegExp(`${n}="([^"]*)"`))?.[1] ?? null;
    const id = attr("data-pid");
    const emisor = attr("data-bk");
    const comercio = attr("data-mc");
    if (!id || !emisor || !comercio || vistos.has(id)) continue;
    const pct = trozo(bloque, "ci__d");
    const valor = pct ? Number(String(pct).replace(/[^\d]/g, "")) : NaN;
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const meta = trozo(bloque, "ci__meta");
    const nota = trozo(bloque, "ci__note");
    const texto = `${meta ?? ""} ${nota ?? ""}`;
    const tipo = /reintegro|devoluci[oó]n/i.test(texto) ? "reintegro" : "descuento";
    vistos.add(id);
    out.push({
      id,
      emisor,
      comercio,
      valor,
      tipo,
      tope: plata(meta),
      topePeriodo: meta && /x mes/i.test(meta) ? "mensual" : meta && /x semana/i.test(meta) ? "semanal" : null,
      dias: dias(bloque),
      nota: nota || null,
      url: attr("href")
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
      headers: { "user-agent": "BISHUSHA/1.0 (app personal de finanzas)" }
    });
    if (!r.ok) return json({ error: `clash contest\xF3 ${r.status}` }, 502);
    const promos = leerPromosClash(await r.text());
    return json({ rubro, promos, cuando: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
