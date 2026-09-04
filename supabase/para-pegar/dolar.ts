// dolar — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/dolar/index.ts

// supabase/functions/_shared/comun.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
var CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// supabase/functions/_shared/dolar.ts
var cotizacion = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 100 && n < 1e5 ? Math.round(n * 100) / 100 : null;
};
function leerDolar(d) {
  if (Array.isArray(d)) {
    const cual = (re) => d.find((x) => re.test(String(x?.casa ?? "")) || re.test(String(x?.nombre ?? "")));
    const mep = cual(/bolsa|mep/i), blue = cual(/blue/i);
    const v = cotizacion(mep?.venta) ?? cotizacion(mep?.compra);
    return v ? { mep: v, blue: cotizacion(blue?.venta) } : null;
  }
  if (d && typeof d === "object") {
    const v = cotizacion(d?.mep?.al30?.ci?.price) ?? cotizacion(d?.mep?.al30?.["24hs"]?.price) ?? cotizacion(d?.mep?.ci?.price) ?? cotizacion(d?.mep?.price) ?? cotizacion(d?.mep);
    return v ? { mep: v, blue: cotizacion(d?.blue?.ask) ?? cotizacion(d?.blue?.price) ?? cotizacion(d?.blue) } : null;
  }
  return null;
}

// supabase/functions/dolar/index.ts
var FUENTES = [
  { nombre: "dolarapi", url: "https://dolarapi.com/v1/dolares" },
  { nombre: "criptoya", url: "https://criptoya.com/api/dolar" }
];
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const errores = [];
  for (const f of FUENTES) {
    try {
      const ctrl = new AbortController();
      const reloj = setTimeout(() => ctrl.abort(), 1e4);
      const r = await fetch(f.url, {
        signal: ctrl.signal,
        headers: { accept: "application/json" }
      });
      clearTimeout(reloj);
      if (!r.ok) {
        errores.push(`${f.nombre}: contest\xF3 ${r.status}`);
        continue;
      }
      const valor = leerDolar(await r.json());
      if (valor) return json({ ...valor, fuente: f.nombre, cuando: (/* @__PURE__ */ new Date()).toISOString() });
      errores.push(`${f.nombre}: contest\xF3 pero no encontr\xE9 el MEP`);
    } catch (e) {
      errores.push(`${f.nombre}: ${String(e).slice(0, 80)}`);
    }
  }
  return json({ error: "ninguna fuente contest\xF3", intentos: errores }, 502);
});
