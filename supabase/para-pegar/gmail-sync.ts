// gmail-sync — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/gmail-sync/index.ts

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

// supabase/functions/_shared/parsers.ts
function plata(s) {
  if (!s) return NaN;
  let t = s.replace(/[^\d.,-]/g, "").trim();
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  } else if (/\.\d{3}$/.test(t) && !/\.\d{1,2}$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  return Number(t);
}
function limpiar(s) {
  return (s || "").replace(/\s+/g, " ").replace(/^[\s"'*.-]+|[\s"'*.-]+$/g, "").trim().slice(0, 80);
}
function fechaAR(s, fallback) {
  if (!s) return fallback;
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return fallback;
  const [, d, mo, y] = m;
  const yy = y.length === 2 ? "20" + y : y;
  return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
var MONEDA = (t) => /u\$s|usd|d[oó]lar/i.test(t) ? "USD" : "ARS";
var REGLAS = [
  // ---------------- Banco Galicia: consumo con tarjeta ----------------
  {
    emisor: "galicia",
    remitentes: /galicia|bancogalicia/i,
    test: /(compra|consumo|pago).{0,40}(tarjeta|cr[eé]dito|d[eé]bito)|realizaste (una )?(compra|consumo)/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:por|de)\s*(?:\$|ars|u\$s|usd)\s*([\d.,]+)/i) || t.match(/(?:\$|u\$s)\s*([\d.,]+)/i);
      if (!monto) return null;
      const com = t.match(/\ben\s+([A-ZÁÉÍÓÚÑ0-9][^.,\n]{2,60}?)(?=\s+(?:con|el|los|por|el d[ií]a|\.|,|$))/) || t.match(/comercio:?\s*([^\n,.]{2,60})/i);
      const u4 = t.match(/terminad[ao]\s*(?:en)?\s*(\d{4})/i) || t.match(/\*{2,}\s*(\d{4})/);
      const cuo = t.match(/(\d{1,2})\s*cuotas?/i);
      return {
        monto: plata(monto[1]),
        moneda: MONEDA(t),
        comercio: limpiar(com?.[1] || "Consumo Galicia"),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: u4?.[1] || null,
        cuotas: cuo ? Number(cuo[1]) : 1,
        medio: /d[eé]bito/i.test(t) ? "debito" : "credito",
        emisor: "galicia",
        confianza: com ? 90 : 65,
        tipo: "gasto"
      };
    }
  },
  // ---------------- MODO ----------------
  {
    emisor: "modo",
    remitentes: /modo|playdigital/i,
    test: /pagaste|pago realizado|comprobante de pago/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:\$|ars)\s*([\d.,]+)/i);
      if (!monto) return null;
      const com = t.match(/\ben\s+([^\n.,]{2,60})/i) || t.match(/comercio:?\s*([^\n,.]{2,60})/i);
      const cuo = t.match(/(\d{1,2})\s*cuotas?/i);
      const u4 = t.match(/terminad[ao]\s*(?:en)?\s*(\d{4})/i);
      return {
        monto: plata(monto[1]),
        moneda: MONEDA(t),
        comercio: limpiar(com?.[1] || "Pago con MODO"),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: u4?.[1] || null,
        cuotas: cuo ? Number(cuo[1]) : 1,
        medio: "billetera",
        emisor: "modo",
        confianza: com ? 88 : 60,
        tipo: "gasto"
      };
    }
  },
  // ---------------- Mercado Pago ----------------
  {
    emisor: "mercadopago",
    remitentes: /mercadopago|mercadolibre/i,
    test: /pagaste|compraste|tu pago|comprobante/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:\$|ars)\s*([\d.,]+)/i);
      if (!monto) return null;
      const com = t.match(/(?:pagaste|compraste)[^\n]{0,30}?\ben\s+([^\n.,]{2,60})/i) || t.match(/\ba\s+([A-ZÁÉÍÓÚÑ][^\n.,]{2,50})/);
      const cuo = t.match(/(\d{1,2})\s*cuotas?/i);
      return {
        monto: plata(monto[1]),
        moneda: MONEDA(t),
        comercio: limpiar(com?.[1] || "Mercado Pago"),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: null,
        cuotas: cuo ? Number(cuo[1]) : 1,
        medio: "billetera",
        emisor: "mercadopago",
        confianza: com ? 85 : 60,
        tipo: "gasto"
      };
    }
  }
];
function parsearMail(remitente, asunto, cuerpo, hoy) {
  const texto = `${asunto}
${cuerpo}`.replace(/ /g, " ");
  for (const r of REGLAS) {
    if (!r.remitentes.test(remitente)) continue;
    if (!r.test.test(texto)) continue;
    try {
      const m = r.extraer(texto, hoy);
      if (m && m.monto > 0 && Number.isFinite(m.monto)) return m;
    } catch (_) {
    }
  }
  return null;
}
var ES_RUIDO = /newsletter|promoci[oó]n|beneficio|encuesta|no responder a este mail|clave|token|alerta de seguridad|resumen disponible|vencimiento de tu resumen/i;

// supabase/functions/gmail-sync/index.ts
var REMITENTES = [
  "bancogalicia.com.ar",
  "galicia.ar",
  "modo.com.ar",
  "mercadopago.com.ar",
  "mercadolibre.com.ar"
];
var QUERY = `from:(${REMITENTES.join(" OR ")}) newer_than:14d`;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = admin();
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  let q = sb.from("integrations").select("*").eq("proveedor", "gmail").eq("activo", true);
  if (body.user_id) q = q.eq("user_id", body.user_id);
  const { data: integraciones } = await q;
  const resumen = [];
  for (const it of integraciones ?? []) {
    try {
      resumen.push(await sincronizar(sb, it));
    } catch (e) {
      await sb.from("integrations").update({ ultimo_error: String(e) }).eq("id", it.id);
      resumen.push({ user: it.user_id, error: String(e) });
    }
  }
  return json({ ok: true, resumen });
});
async function sincronizar(sb, it) {
  const token = await accessToken(sb, it);
  const lista = await api(`messages?q=${encodeURIComponent(QUERY)}&maxResults=60`, token);
  let cargados = 0, ignorados = 0, dudosos = 0;
  const { data: cuentas } = await sb.from("accounts").select("*").eq("user_id", it.user_id);
  const { data: cats } = await sb.from("categories").select("*").eq("user_id", it.user_id);
  const { data: reglas } = await sb.from("reglas").select("*").eq("user_id", it.user_id);
  const nuevos = [];
  for (const m of lista.messages ?? []) {
    const { data: visto } = await sb.from("ingest_log").select("id").eq("user_id", it.user_id).eq("fuente", "gmail").eq("externo_id", m.id).maybeSingle();
    if (visto) continue;
    const msg = await api(`messages/${m.id}?format=full`, token);
    const cab = (n) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
    const remitente = cab("from"), asunto = cab("subject");
    const fechaMail = new Date(Number(msg.internalDate || Date.now()));
    const cuerpo = textoDe(msg.payload);
    const log = {
      user_id: it.user_id,
      fuente: "gmail",
      externo_id: m.id,
      remitente,
      asunto,
      recibido_at: fechaMail.toISOString()
    };
    if (ES_RUIDO.test(asunto + " " + cuerpo.slice(0, 400))) {
      await sb.from("ingest_log").insert({ ...log, estado: "ignorado", detalle: "no es un consumo" });
      ignorados++;
      continue;
    }
    const mov = parsearMail(remitente, asunto, cuerpo, fechaMail.toISOString().slice(0, 10));
    if (!mov) {
      await sb.from("ingest_log").insert({ ...log, estado: "ignorado", detalle: "sin patron que matchee" });
      ignorados++;
      continue;
    }
    const tx = await insertar(sb, it.user_id, mov, cuentas ?? [], cats ?? [], reglas ?? [], m.id);
    if (tx === "duplicado") {
      await sb.from("ingest_log").insert({ ...log, estado: "duplicado" });
      continue;
    }
    await sb.from("ingest_log").insert({ ...log, estado: "cargado", transaction_id: tx.id });
    cargados++;
    if (mov.confianza < 75) dudosos++;
    nuevos.push(`${mov.comercio} ${mov.moneda === "USD" ? "U$S" : "$"}${mov.monto.toLocaleString("es-AR")}`);
  }
  await sb.from("integrations").update({ ultima_sync: (/* @__PURE__ */ new Date()).toISOString(), ultimo_error: null }).eq("id", it.id);
  if (cargados) {
    await sb.from("notificaciones").insert({
      user_id: it.user_id,
      tipo: "carga_auto",
      titulo: `${cargados} ${cargados === 1 ? "gasto cargado" : "gastos cargados"} solo`,
      cuerpo: nuevos.slice(0, 4).join(" \xB7 ") + (dudosos ? ` \xB7 ${dudosos} para revisar` : "")
    });
  }
  return { user: it.user_id, cargados, ignorados, dudosos };
}
async function insertar(sb, userId, mov, cuentas, cats, reglas, externoId) {
  let cuenta = mov.ultimos4 ? cuentas.find((c) => c.ultimos4 === mov.ultimos4) : null;
  if (!cuenta) {
    cuenta = cuentas.find((c) => mov.emisor === "galicia" && /galicia/i.test(c.banco ?? "") && c.tipo === (mov.medio === "debito" ? "debito" : "credito") || mov.emisor !== "galicia" && new RegExp(mov.emisor, "i").test(c.nombre));
  }
  const texto = mov.comercio.toLowerCase();
  let catId = reglas.sort((a, b) => b.prioridad - a.prioridad).find((r) => texto.includes(String(r.patron).toLowerCase()))?.category_id ?? null;
  if (!catId) catId = porPalabraClave(texto, cats);
  const fila = {
    user_id: userId,
    fecha: mov.fecha,
    descripcion: mov.comercio,
    comercio: mov.comercio,
    monto: mov.monto,
    moneda: mov.moneda,
    tipo: mov.tipo,
    cuotas: mov.cuotas,
    account_id: cuenta?.id ?? null,
    category_id: catId,
    fuente: "gmail",
    externo_id: externoId,
    revisado: false,
    confianza: mov.confianza
  };
  const { data, error } = await sb.from("transactions").insert(fila).select().single();
  if (error) return error.code === "23505" ? "duplicado" : Promise.reject(error);
  return data;
}
var CLAVES = {
  "Supermercado": /coto|carrefour|jumbo|dia|vea|disco|changomas|chango|libertad|makro|vital|super/i,
  "Combustible / Transporte": /ypf|shell|axion|puma|sube|telepase|uber|cabify|estacion/i,
  "Gastronomia": /rappi|pedidosya|resto|caf[eé]|bar |pizz|burger|mostaza|starbucks|heladeria/i,
  "Salud": /farmacia|farmacity|farmaplus|simplicity|clinica|hospital|osde|swiss/i,
  "Servicios": /edesur|edenor|metrogas|aysa|personal|movistar|claro|telecentro|fibertel|flow/i,
  "Entretenimiento": /netflix|spotify|disney|hbo|max|prime video|steam|playstation|cine/i,
  "Hogar": /easy|sodimac|ferreteria|sanitarios|pinturer/i,
  "Indumentaria": /zara|adidas|nike|dexter|stock center|indumentaria|calzado/i
};
function porPalabraClave(texto, cats) {
  for (const [nombre, rx] of Object.entries(CLAVES)) {
    if (rx.test(texto)) return cats.find((c) => c.nombre === nombre)?.id ?? null;
  }
  return null;
}
async function accessToken(sb, it) {
  if (it.expira_at && new Date(it.expira_at) > new Date(Date.now() + 6e4)) return it.access_token;
  const r = await (await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID"),
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
      refresh_token: it.refresh_token,
      grant_type: "refresh_token"
    })
  })).json();
  if (r.error) throw new Error("refresh: " + (r.error_description ?? r.error));
  await sb.from("integrations").update({
    access_token: r.access_token,
    expira_at: new Date(Date.now() + r.expires_in * 1e3).toISOString()
  }).eq("id", it.id);
  return r.access_token;
}
async function api(path, token) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error(`gmail ${r.status}: ${await r.text()}`);
  return r.json();
}
function textoDe(payload) {
  if (!payload) return "";
  const dec = (d) => {
    try {
      const b = atob(d.replace(/-/g, "+").replace(/_/g, "/"));
      return new TextDecoder("utf-8").decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
    } catch {
      return "";
    }
  };
  if (payload.mimeType === "text/plain" && payload.body?.data) return dec(payload.body.data);
  if (payload.parts) {
    const plano = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plano?.body?.data) return dec(plano.body.data);
    for (const p of payload.parts) {
      const t = textoDe(p);
      if (t) return t;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return dec(payload.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  }
  return "";
}
