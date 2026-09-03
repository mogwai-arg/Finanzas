// mp-sync — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/mp-sync/index.ts

// supabase/functions/_shared/comun.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
var admin = () => createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);
var CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// supabase/functions/_shared/duplicados.ts
function elMismo(a, b, { dias = 3, pesos = 1 } = {}) {
  if ((a.tipo || "gasto") !== (b.tipo || "gasto")) return false;
  if ((a.moneda || "ARS") !== (b.moneda || "ARS")) return false;
  if (Math.abs(Number(a.monto) - Number(b.monto)) > pesos) return false;
  if (a.account_id && b.account_id && a.account_id !== b.account_id) return false;
  const d = Math.abs(
    (Date.parse(String(a.fecha).slice(0, 10)) - Date.parse(String(b.fecha).slice(0, 10))) / 864e5
  );
  return Number.isFinite(d) && d <= dias;
}
function yaEstaba(fila, previos = [], opciones = {}) {
  return previos.find((p) => elMismo(fila, p, opciones)) ?? null;
}
function loQueSuma(previo, nuevo) {
  const cambios = {};
  if (!previo.account_id && nuevo.account_id) cambios.account_id = nuevo.account_id;
  if ((!previo.cuotas || previo.cuotas === 1) && nuevo.cuotas > 1) cambios.cuotas = nuevo.cuotas;
  if (!previo.category_id && nuevo.category_id) cambios.category_id = nuevo.category_id;
  if (nuevo.externo_id && previo.externo_id !== nuevo.externo_id) {
    cambios.externo_id = nuevo.externo_id;
    cambios.fuente = "mercadopago";
  }
  return Object.keys(cambios).length ? cambios : null;
}

// supabase/functions/_shared/pagos.ts
var ES_PAGO = /pago\s*(de\s*)?(tu\s*)?(tarjeta|resumen)|pago\s*(visa|master|mastercard|amex|american)|su pago en pesos|pagaste tu (resumen|tarjeta)|pago de tu (resumen|tarjeta)|cancelaci[oó]n de resumen/i;
function esPagoDeTarjeta(texto, cuentas = []) {
  const t = String(texto || "");
  if (!ES_PAGO.test(t)) return null;
  const tarjetas = cuentas.filter((c) => c.tipo === "credito" && c.activo !== false);
  if (!tarjetas.length) return null;
  const cuatro = t.match(/\b(?:\*{2,4}\s*)?(\d{4})\b(?!\s*[.,]\d)/g) || [];
  for (const c of tarjetas) {
    if (c.ultimos4 && cuatro.some((x) => x.replace(/\D/g, "") === c.ultimos4)) return c;
  }
  for (const c of tarjetas) {
    const marca = String(c.nombre || "").toLowerCase().match(/visa|master(card)?|amex|american/)?.[0];
    if (marca && new RegExp(marca, "i").test(t)) return c;
  }
  return tarjetas.length === 1 ? tarjetas[0] : null;
}
function comoPagoDeTarjeta(fila, tarjeta) {
  return {
    ...fila,
    tipo: "transferencia",
    destino_account_id: tarjeta.id,
    account_id: fila.account_id ?? null,
    descripcion: `Pago ${tarjeta.nombre ?? "tarjeta"}`,
    // Una movida no va a ninguna categoría de gasto: la plata sigue siendo
    // tuya, cambió de lugar. Dejarle la categoría la metería en el gráfico de
    // en qué se fue.
    category_id: null,
    cuotas: 1
  };
}

// supabase/functions/mp-sync/index.ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = admin();
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  let q = sb.from("integrations").select("*").eq("proveedor", "mercadopago").eq("activo", true);
  if (body.user_id) q = q.eq("user_id", body.user_id);
  const { data: integraciones } = await q;
  const out = [];
  for (const it of integraciones ?? []) {
    try {
      out.push(await traer(sb, it));
    } catch (e) {
      await sb.from("integrations").update({ ultimo_error: String(e) }).eq("id", it.id);
      out.push({ user: it.user_id, error: String(e) });
    }
  }
  return json({ ok: true, out });
});
async function traer(sb, it) {
  const token = await accessToken(sb, it);
  const desde = it.ultima_sync ?? new Date(Date.now() - 30 * 864e5).toISOString();
  const url = "https://api.mercadopago.com/v1/payments/search?" + new URLSearchParams({
    sort: "date_created",
    criteria: "desc",
    limit: "100",
    "range": "date_created",
    "begin_date": desde,
    "end_date": "NOW"
  });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`mp ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const { data: cuentas } = await sb.from("accounts").select("*").eq("user_id", it.user_id);
  const cuentaMP = (cuentas ?? []).find((c) => /mercado ?pago/i.test(c.nombre));
  let cargados = 0, adoptados = 0;
  const nuevos = [];
  const { data: previos } = await sb.from("transactions").select("*").eq("user_id", it.user_id).gte("fecha", String(desde).slice(0, 10));
  for (const p of data.results ?? []) {
    if (p.status !== "approved") continue;
    const esGasto = String(p.payer?.id ?? "") === String(it.cuenta);
    const monto = Number(p.transaction_amount ?? 0);
    if (!(monto > 0)) continue;
    let fila = {
      user_id: it.user_id,
      fecha: String(p.date_approved ?? p.date_created).slice(0, 10),
      descripcion: p.description ?? "Mercado Pago",
      comercio: p.description ?? (esGasto ? p.collector_id : p.payer?.email) ?? "Mercado Pago",
      monto,
      moneda: p.currency_id === "USD" ? "USD" : "ARS",
      tipo: esGasto ? "gasto" : "ingreso",
      cuotas: Number(p.installments ?? 1),
      account_id: cuentaMP?.id ?? null,
      fuente: "mercadopago",
      externo_id: String(p.id),
      revisado: false,
      confianza: 95
    };
    const tarjeta = esPagoDeTarjeta(
      `${fila.descripcion} ${fila.comercio} ${p.payment_method_id ?? ""}`,
      cuentas ?? []
    );
    if (tarjeta) fila = comoPagoDeTarjeta(fila, tarjeta);
    const previo = yaEstaba(fila, previos ?? []);
    if (previo) {
      const suma = loQueSuma(previo, fila);
      if (suma) await sb.from("transactions").update(suma).eq("id", previo.id);
      adoptados++;
      continue;
    }
    const { error } = await sb.from("transactions").insert(fila);
    if (error) {
      if (error.code !== "23505") console.error(error);
      continue;
    }
    (previos ?? []).push(fila);
    cargados++;
    nuevos.push(`${fila.comercio} $${monto.toLocaleString("es-AR")}`);
  }
  await sb.from("integrations").update({ ultima_sync: (/* @__PURE__ */ new Date()).toISOString(), ultimo_error: null }).eq("id", it.id);
  if (cargados) {
    await sb.from("notificaciones").insert({
      user_id: it.user_id,
      tipo: "carga_auto",
      titulo: `${cargados} de Mercado Pago`,
      cuerpo: nuevos.slice(0, 4).join(" \xB7 ")
    });
  }
  return { user: it.user_id, cargados, adoptados };
}
async function accessToken(sb, it) {
  if (it.expira_at && new Date(it.expira_at) > new Date(Date.now() + 6e4)) return it.access_token;
  if (!it.refresh_token) return it.access_token;
  const r = await (await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("MP_CLIENT_ID"),
      client_secret: Deno.env.get("MP_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: it.refresh_token
    })
  })).json();
  if (r.error) throw new Error("refresh mp: " + (r.message ?? r.error));
  await sb.from("integrations").update({
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? it.refresh_token,
    expira_at: new Date(Date.now() + (r.expires_in ?? 3600) * 1e3).toISOString()
  }).eq("id", it.id);
  return r.access_token;
}
