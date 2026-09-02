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
  // ---------------- Banco Galicia: plata que entra o sale de la cuenta ----
  //
  // Va despues de la regla de tarjetas a proposito: una compra con tarjeta
  // tambien nombra al banco, y ahi manda la otra.
  {
    emisor: "galicia",
    remitentes: /galicia|bancogalicia/i,
    test: /transferencia|dep[oó]sito|acreditaci[oó]n|se acredit[oó]|se debit[oó]|d[eé]bito autom[aá]tico|haberes/i,
    extraer(t, hoy) {
      const monto = t.match(/(?:por|de)\s*(?:\$|ars|u\$s|usd)\s*([\d.,]+)/i) || t.match(/(?:\$|u\$s)\s*([\d.,]+)/i);
      if (!monto) return null;
      const entra = /recibiste|se acredit[oó]|acreditaci[oó]n|dep[oó]sito|haberes|ingres[oó]/i.test(t);
      const sale = /enviaste|se debit[oó]|d[eé]bito autom[aá]tico|transferencia enviada/i.test(t);
      if (entra === sale) return null;
      const quien = t.match(/(?:de|a)\s+([A-ZÁÉÍÓÚÑ][^\n.,]{2,50}?)(?=\s+(?:por|el|con|\.|,|$))/);
      const concepto = /haberes/i.test(t) ? "Acreditaci\xF3n de haberes" : /d[eé]bito autom[aá]tico/i.test(t) ? "D\xE9bito autom\xE1tico" : /dep[oó]sito/i.test(t) ? "Dep\xF3sito" : entra ? "Transferencia recibida" : "Transferencia enviada";
      return {
        monto: plata(monto[1]),
        moneda: MONEDA(t),
        comercio: limpiar(quien ? `${concepto} \xB7 ${quien[1]}` : concepto),
        fecha: fechaAR(t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)?.[0], hoy),
        ultimos4: null,
        cuotas: 1,
        // 'cuenta' para que caiga en la cuenta bancaria y no en una tarjeta.
        medio: "cuenta",
        emisor: "galicia",
        confianza: quien ? 92 : 85,
        tipo: entra ? "ingreso" : "gasto"
      };
    }
  },
  // ---------------- MODO ----------------
  {
    emisor: "modo",
    remitentes: /modo|playdigital/i,
    test: /pagaste|pago realizado|comprobante de pago|operaci[oó]n realizada/i,
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
    test: /pagaste|compraste|tu pago|comprobante de (pago|compra)/i,
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
var ANUNCIA_FUERTE = /(nuevo valor|nuevo importe|pasar[aá] a ser|pasa a ser|pasa a|se actualiza a|actualizad[oa] a|nueva cuota|queda en)/i;
var ANUNCIA_DEBIL = /(valor de la cuota|cuota de|importe de|abonar[aá]s?|ser[aá] de)/i;
var HABLA_DE_AUMENTO = /aument|ajuste|actualiza|incremento|nuevo valor|nueva cuota/i;
var MES = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i;
function leerAumento(texto) {
  const t = (texto || "").replace(/\s+/g, " ");
  const fuerte = t.match(ANUNCIA_FUERTE);
  const debil = HABLA_DE_AUMENTO.test(t) ? t.match(ANUNCIA_DEBIL) : null;
  const m = fuerte || debil;
  if (!m || m.index == null) return null;
  const cerca = t.slice(m.index, m.index + 160);
  const imp = cerca.match(/(?:\$|ars)\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
  if (!imp) return null;
  const monto = plata(imp[1]);
  if (!Number.isFinite(monto) || monto <= 0) return null;
  const desde = t.match(new RegExp(`a partir de[^.]{0,20}?${MES.source}`, "i")) || t.match(MES);
  return { monto, desde: desde ? desde[desde.length - 1].toLowerCase() : null };
}
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
var ES_RUIDO = new RegExp([
  // lo que ya estaba
  "newsletter",
  "promoci[o\xF3]n",
  "beneficio",
  "encuesta",
  "no responder a este mail",
  "clave",
  "token",
  "alerta de seguridad",
  "resumen disponible",
  "vencimiento de tu resumen",
  "vence el",
  "pr[o\xF3]ximo vencimiento",
  "recordatorio de pago",
  // vocabulario de oferta
  "sin inter[e\xE9]s",
  "cuotas fijas",
  "hasta \\d+ cuotas",
  "descuento",
  "reintegro de hasta",
  "ahorr[a\xE1]",
  "\\d+ *% *(de *)?(off|descuento)",
  "promo\\b",
  "promos\\b",
  "sorteo",
  "suscrib[i\xED]",
  "te regalamos",
  "exclusivo para",
  "v[a\xE1]lido hasta",
  "te esperamos",
  // imperativos: la publicidad invita, el aviso informa
  "compr[a\xE1]\\b",
  "aprovech[a\xE1]",
  "disfrut[a\xE1]",
  "llevate",
  "conoc[e\xE9]\\b",
  "enterate",
  "descubr[i\xED]",
  "pod[e\xE9]s comprar",
  "ingres[a\xE1] a"
].join("|"), "i");
var ES_CONSUMO = new RegExp([
  "realizaste",
  "realizaste un consumo",
  "se realiz[o\xF3]",
  "hiciste (una )?compra",
  "compra realizada",
  "consumo realizado",
  "aviso de consumo",
  "compraste",
  "pagaste",
  "aprobad[ao]",
  "acreditad[ao]",
  "comprobante de (pago|compra)",
  "tu pago",
  "operaci[o\xF3]n realizada",
  "se debit[o\xF3]",
  "se acredit[o\xF3]",
  // Ninguna publicidad dice los ultimos cuatro de tu tarjeta.
  "terminad[ao] *(en)? *\\d{4}",
  "\\*{2,} *\\d{4}"
].join("|"), "i");

// supabase/functions/gmail-sync/index.ts
var REMITENTES = [
  "bancogalicia.com.ar",
  "galicia.ar",
  "modo.com.ar",
  "mercadopago.com.ar",
  "mercadolibre.com.ar"
];
var QUERY = `from:(${REMITENTES.join(" OR ")}) newer_than:14d`;
var QUERY_ANCHA = "from:(galicia OR bancogalicia OR modo OR mercadopago OR mercadolibre OR personalpay OR naranja OR uala OR brubank) newer_than:30d";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = admin();
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  let q = sb.from("integrations").select("*").eq("proveedor", "gmail").eq("activo", true);
  if (body.user_id) q = q.eq("user_id", body.user_id);
  const { data: integraciones } = await q;
  if (body.solo_ver) {
    const it = (integraciones ?? [])[0];
    if (!it) return json({ error: "no hay Gmail conectado" }, 400);
    return json(await mirar(sb, it));
  }
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
async function mirar(sb, it) {
  const token = await accessToken(sb, it);
  const lista = await api(`messages?q=${encodeURIComponent(QUERY_ANCHA)}&maxResults=25`, token);
  const vistos = [];
  for (const m of (lista.messages ?? []).slice(0, 25)) {
    const msg = await api(`messages/${m.id}?format=full`, token);
    const cab = (n) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
    const remitente = cab("from"), asunto = cab("subject");
    const cuerpo = textoDe(msg.payload);
    const muestra = asunto + " " + cuerpo.slice(0, 600);
    const fecha = new Date(Number(msg.internalDate || Date.now())).toISOString().slice(0, 10);
    let veredicto;
    if (ES_RUIDO.test(muestra)) veredicto = "descartado \xB7 parece publicidad o aviso";
    else if (!ES_CONSUMO.test(muestra)) veredicto = "descartado \xB7 no dice que algo ya pas\xF3";
    else {
      const mov = parsearMail(remitente, asunto, cuerpo, fecha);
      veredicto = !mov ? "descartado \xB7 ninguna regla lo entiende" : mov.confianza < 75 ? `descartado \xB7 poca confianza (${mov.confianza})` : `SE CARGA \xB7 ${mov.tipo} ${mov.moneda} ${mov.monto} \xB7 ${mov.comercio}`;
    }
    vistos.push({ fecha, de: remitente.slice(0, 60), asunto: asunto.slice(0, 80), veredicto });
  }
  return { encontrados: (lista.messages ?? []).length, busqueda: QUERY_ANCHA, vistos };
}
async function sincronizar(sb, it) {
  const token = await accessToken(sb, it);
  const lista = await api(`messages?q=${encodeURIComponent(QUERY)}&maxResults=60`, token);
  let cargados = 0, ignorados = 0, adoptados = 0;
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
    const muestra = asunto + " " + cuerpo.slice(0, 600);
    if (ES_RUIDO.test(muestra)) {
      await sb.from("ingest_log").insert({ ...log, estado: "ignorado", detalle: "publicidad o aviso, no un consumo" });
      ignorados++;
      continue;
    }
    if (!ES_CONSUMO.test(muestra)) {
      await sb.from("ingest_log").insert({ ...log, estado: "ignorado", detalle: "no dice que la compra ya ocurri\xF3" });
      ignorados++;
      continue;
    }
    const mov = parsearMail(remitente, asunto, cuerpo, fechaMail.toISOString().slice(0, 10));
    if (!mov) {
      await sb.from("ingest_log").insert({ ...log, estado: "ignorado", detalle: "sin patron que matchee" });
      ignorados++;
      continue;
    }
    if (mov.confianza < 75) {
      await sb.from("ingest_log").insert({
        ...log,
        estado: "ignorado",
        detalle: `poca confianza (${mov.confianza}): no se reconoci\xF3 el comercio`
      });
      ignorados++;
      continue;
    }
    const tx = await insertar(sb, it.user_id, mov, cuentas ?? [], cats ?? [], reglas ?? [], m.id);
    if (tx === "duplicado") {
      await sb.from("ingest_log").insert({ ...log, estado: "duplicado" });
      continue;
    }
    if (tx === "adoptado") {
      await sb.from("ingest_log").insert({
        ...log,
        estado: "duplicado",
        detalle: "ya estaba anotado a mano; se complet\xF3"
      });
      adoptados++;
      continue;
    }
    await sb.from("ingest_log").insert({ ...log, estado: "cargado", transaction_id: tx.id });
    cargados++;
    nuevos.push(`${mov.comercio} ${mov.moneda === "USD" ? "U$S" : "$"}${mov.monto.toLocaleString("es-AR")}`);
  }
  const aumentos = await buscarAumentos(sb, it, token);
  await sb.from("integrations").update({ ultima_sync: (/* @__PURE__ */ new Date()).toISOString(), ultimo_error: null }).eq("id", it.id);
  if (cargados) {
    await sb.from("notificaciones").insert({
      user_id: it.user_id,
      tipo: "carga_auto",
      titulo: `${cargados} ${cargados === 1 ? "gasto cargado" : "gastos cargados"} solo`,
      cuerpo: nuevos.slice(0, 4).join(" \xB7 ")
    });
  }
  return { user: it.user_id, cargados, ignorados, adoptados, aumentos };
}
async function buscarAumentos(sb, it, token) {
  const { data: fijos } = await sb.from("recurrings").select("*").eq("user_id", it.user_id).eq("activo", true);
  let propuestos = 0;
  for (const r of fijos ?? []) {
    const nombre = String(r.nombre || "").trim();
    if (nombre.length < 4) continue;
    const q = `"${nombre}" newer_than:90d`;
    const lista = await api(`messages?q=${encodeURIComponent(q)}&maxResults=5`, token).catch(() => ({ messages: [] }));
    for (const m of lista.messages ?? []) {
      const msg = await api(`messages/${m.id}?format=full`, token);
      const cab = (n) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
      const texto = cab("subject") + " " + textoDe(msg.payload).slice(0, 2e3);
      const a = leerAumento(texto);
      if (!a) continue;
      const actual = Number(r.monto_estimado) || 0;
      if (!actual || Math.abs(a.monto - actual) / actual < 0.02) continue;
      const { error } = await sb.from("notificaciones").insert({
        user_id: it.user_id,
        tipo: "aumento",
        titulo: `${nombre} pasa a ${a.monto.toLocaleString("es-AR")}`,
        cuerpo: `Ten\xE9s cargado ${actual.toLocaleString("es-AR")}` + (a.desde ? ` \xB7 desde ${a.desde}` : ""),
        ref_tabla: "recurrings",
        ref_id: r.id,
        datos: { monto: a.monto, anterior: actual, desde: a.desde, asunto: cab("subject") }
      });
      if (!error) propuestos++;
      break;
    }
  }
  return propuestos;
}
async function insertar(sb, userId, mov, cuentas, cats, reglas, externoId) {
  let cuenta = mov.ultimos4 ? cuentas.find((c) => c.ultimos4 === mov.ultimos4) : null;
  if (!cuenta) {
    const tipoBuscado = mov.medio === "cuenta" ? "cuenta" : mov.medio === "debito" ? "debito" : "credito";
    cuenta = cuentas.find((c) => mov.emisor === "galicia" && /galicia/i.test(c.banco ?? c.nombre ?? "") && c.tipo === tipoBuscado || mov.emisor !== "galicia" && new RegExp(mov.emisor, "i").test(c.nombre));
  }
  const texto = mov.comercio.toLowerCase();
  let catId = reglas.sort((a, b) => b.prioridad - a.prioridad).find((r) => texto.includes(String(r.patron).toLowerCase()))?.category_id ?? null;
  if (!catId) catId = porPalabraClave(texto, cats);
  const desde = new Date(new Date(mov.fecha).getTime() - 4 * 864e5).toISOString().slice(0, 10);
  const hasta = new Date(new Date(mov.fecha).getTime() + 4 * 864e5).toISOString().slice(0, 10);
  const { data: previos } = await sb.from("transactions").select("*").eq("user_id", userId).eq("fuente", "manual").eq("tipo", mov.tipo).eq("moneda", mov.moneda).gte("fecha", desde).lte("fecha", hasta);
  const previo = (previos ?? []).find((p) => Math.abs(Number(p.monto) - mov.monto) <= 1 && (!p.account_id || !cuenta?.id || p.account_id === cuenta.id));
  if (previo) {
    await sb.from("transactions").update({
      account_id: previo.account_id ?? cuenta?.id ?? null,
      cuotas: mov.cuotas,
      externo_id: externoId,
      fuente: "gmail",
      revisado: true
    }).eq("id", previo.id);
    return "adoptado";
  }
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
