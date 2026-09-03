// cron-avisos — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/cron-avisos/index.ts

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
async function usuarioDe(req) {
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return null;
  const { data } = await admin().auth.getUser(jwt);
  return data.user ?? null;
}

// supabase/functions/_shared/avisos.ts
var plata = (n, moneda = "ARS") => `${moneda === "USD" ? "US$" : "$"} ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.abs(Math.round(Number(n) || 0)))}`;
var aFecha = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
var dias = (a, b) => Math.round((b.getTime() - a.getTime()) / 864e5);
var ultimoDia = (y, m) => new Date(y, m + 1, 0).getDate();
var diaSeguro = (y, m, d) => new Date(y, m, Math.min(d, ultimoDia(y, m)));
function saldoDeCuenta(cuenta, txs, ref) {
  let saldo = Number(cuenta.saldo_inicial) || 0;
  const corte = cuenta.saldo_al ? aFecha(cuenta.saldo_al) : null;
  for (const tx of txs) {
    const f = aFecha(tx.fecha);
    if (f > ref) continue;
    if (corte && f < corte) continue;
    const propio = tx.account_id === cuenta.id;
    const destino = tx.destino_account_id === cuenta.id;
    if (!propio && !destino) continue;
    if (tx.tipo === "transferencia") {
      if (propio) saldo -= Number(tx.monto);
      if (destino) saldo += Number(tx.monto_destino != null ? tx.monto_destino : tx.monto);
      continue;
    }
    if (!propio) continue;
    if (cuenta.tipo === "credito") continue;
    saldo += tx.tipo === "ingreso" ? Number(tx.monto) : -Number(tx.monto);
  }
  return Math.round(saldo * 100) / 100;
}
function promoAplica(p, ref) {
  if (p.activa === false) return false;
  const iso = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
  if (p.vigencia_desde && p.vigencia_desde > iso) return false;
  if (p.vigencia_hasta && p.vigencia_hasta < iso) return false;
  const d = p.dias || [];
  return d.length === 0 || d.includes(ref.getDay());
}
function avisosDelDia(d, ref = /* @__PURE__ */ new Date()) {
  const on = (k) => d.prefs?.[k] !== false;
  const out = [];
  const hoy = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dia = hoy.getDate();
  const per = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  if (on("pagos")) {
    for (const r of d.recurrings ?? []) {
      if (r.activo === false) continue;
      const pago = (d.pagos ?? []).find((p) => p.recurring_id === r.id && p.periodo === per && p.pagado_at);
      if (pago) continue;
      const vence = diaSeguro(hoy.getFullYear(), hoy.getMonth(), r.dia_vencimiento || 1);
      const n = dias(hoy, vence);
      const monto = plata(r.monto_estimado, r.moneda);
      if (n === 0) out.push(msg("pagos", `Hoy vence ${r.nombre}`, `${monto}. Cuando lo pagues, tildalo y yo hago la cuenta.`, `fijo-${r.id}`));
      else if (n === 2) out.push(msg("pagos", `${r.nombre} vence en 2 d\xEDas`, `${monto}.`, `fijo-${r.id}`));
      else if (n === -1) out.push(msg("pagos", `${r.nombre} venci\xF3 ayer`, `${monto} y sigue impago.`, `fijo-${r.id}`));
    }
    for (const t of d.cuentas ?? []) {
      if (t.tipo !== "credito" || t.activo === false || !t.vencimiento_dia) continue;
      const n = dias(hoy, diaSeguro(hoy.getFullYear(), hoy.getMonth(), t.vencimiento_dia));
      if (n === 0) out.push(msg("pagos", `Hoy vence ${t.nombre}`, "Mir\xE1 en Hoy cu\xE1nto qued\xF3 por pagar.", `tj-${t.id}`));
      else if (n === 2) out.push(msg("pagos", `${t.nombre} vence en 2 d\xEDas`, "Mir\xE1 en Hoy cu\xE1nto qued\xF3 por pagar.", `tj-${t.id}`));
    }
  }
  if (on("saldo")) {
    const minimo = Number(d.saldoMinimo) || 0;
    for (const c of d.cuentas ?? []) {
      if (c.tipo === "credito" || c.activo === false) continue;
      const saldo = saldoDeCuenta(c, d.txs ?? [], hoy);
      if (saldo < 0)
        out.push(msg("saldo", `${c.nombre} qued\xF3 en rojo`, `${plata(saldo, c.moneda)} en contra.`, `saldo-${c.id}`));
      else if (minimo > 0 && saldo < minimo && (c.moneda || "ARS") === "ARS")
        out.push(msg("saldo", `Queda poco en ${c.nombre}`, `${plata(saldo)}, por debajo del m\xEDnimo que pusiste.`, `saldo-${c.id}`));
    }
  }
  if (on("promos")) {
    for (const p of d.promos ?? []) {
      if (!p.recordar || !promoAplica(p, hoy)) continue;
      const detalle = [
        `${Number(p.valor) || 0}% de ${p.tipo || "descuento"}`,
        p.medio_pago,
        p.tope ? `tope ${plata(p.tope)}` : null
      ].filter(Boolean).join(" \xB7 ");
      out.push(msg("promos", `Hoy: ${p.titulo || p.comercio}`, detalle, `promo-${p.id}`, "./#/promos"));
    }
  }
  if (on("resumen")) {
    for (const t of d.cuentas ?? []) {
      if (t.tipo !== "credito" || t.activo === false || !t.cierre_dia) continue;
      if (dias(hoy, diaSeguro(hoy.getFullYear(), hoy.getMonth(), t.cierre_dia)) !== 1) continue;
      out.push(msg(
        "resumen",
        `${t.nombre} cierra ma\xF1ana`,
        "Lo que compres despu\xE9s entra en el resumen siguiente.",
        `cierre-${t.id}`,
        "./#/tarjetas"
      ));
    }
  }
  if (on("aumentos")) {
    for (const a of d.aumentos ?? []) {
      out.push(msg(
        "aumentos",
        a.titulo || "Subi\xF3 un gasto fijo",
        a.cuerpo || "Miralo en El mes y confirm\xE1 si lo actualizo.",
        `aum-${a.id}`,
        "./#/mes"
      ));
    }
  }
  const despegado = dia === 5 ? seDespegoDelResto(d.recurrings ?? [], d.pagosViejos ?? [], per, d.inflacionRef ?? null) : null;
  if (on("aumentos") && despegado) {
    const a = despegado;
    out.push(msg(
      "aumentos",
      `${a.nombre} subi\xF3 ${Math.round(a.subio)} % en tres meses`,
      `El resto de tus fijos subi\xF3 ${Math.round(a.normal)} %. Son ${plata(a.demas, a.moneda)} de m\xE1s por mes: casi siempre es una promo que se venci\xF3.`,
      `despego-${a.nombre}`,
      "./#/mes"
    ));
  }
  if (on("bishu") && hoy.getDay() === 1 && dia > 7) {
    const antes = Number(d.gastadoMesPasado) || 0;
    const ahora = Number(d.gastadoEsteMes) || 0;
    if (antes > 0 && ahora > 0) {
      const dif = ahora - antes;
      if (Math.abs(dif) / antes >= 0.08 && Math.abs(dif) >= 1e3) {
        out.push(dif < 0 ? msg("bishu", `Vas ${plata(dif)} menos que el mes pasado`, "A esta altura del mes. Bien ah\xED.", "bishu") : msg("bishu", `Vas ${plata(dif)} m\xE1s que el mes pasado`, "A esta altura del mes. Por si quer\xE9s mirarlo.", "bishu"));
      }
    }
  }
  if (on("cierre") && dia === 1) {
    const salio = Number(d.salioMesCerrado) || 0;
    const antes = Number(d.salioMesAnterior) || 0;
    const cuantos = Number(d.movimientosMesCerrado) || 0;
    const cerrado = mesAnterior(per);
    if (salio > 0 || cuantos > 0) {
      const menos = antes - salio;
      const cuerpo = antes > 0 && Math.abs(menos) >= 1e3 ? menos > 0 ? `Gastaste ${plata(menos)} menos que el mes anterior.` : `Gastaste ${plata(-menos)} m\xE1s que el mes anterior.` : `Salieron ${plata(salio)} en ${cuantos} ${cuantos === 1 ? "movimiento" : "movimientos"}.`;
      out.push(msg(
        "cierre",
        `Cerr\xF3 ${nombreDeMes(cerrado)}`,
        cuerpo,
        `cierre-${cerrado}`,
        `./#/cierre/${cerrado}`
      ));
    }
  }
  if (on("viene") && dia === 10) {
    const a = mesApretado(d.proyeccion, hoy);
    if (a) {
      out.push(msg(
        "viene",
        `En ${nombreDeMes(a.periodo)} te queda poco aire`,
        `Lo que ya est\xE1 comprometido se lleva el ${a.pct} % de lo que entra: te quedar\xEDan ${plata(a.libre)} para todo el mes.`,
        `viene-${a.periodo}`,
        "./#/estadisticas"
      ));
    }
  }
  return out;
}
function mesApretado(proy, ref, { umbral = 70, vigencia = 20 } = {}) {
  const meses = proy?.meses;
  if (!Array.isArray(meses) || !meses.length) return null;
  if (!proy.calculada) return null;
  const edad = (ref.getTime() - new Date(proy.calculada).getTime()) / 864e5;
  if (!(edad >= 0) || edad > vigencia) return null;
  const per = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  return meses.filter((m) => m.periodo > per && Number(m.entra) > 0 && Number(m.pct) >= umbral).sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))[0] ?? null;
}
function seDespegoDelResto(recurrings, pagos, per, referencia = null, meses = 3, margen = 10) {
  let desdePer = per;
  for (let i = 0; i < meses; i++) desdePer = mesAnterior(desdePer);
  const pagado = (id, p) => {
    const x = pagos.find((v) => v.recurring_id === id && v.periodo === p && v.pagado_at && v.monto != null);
    return x ? Number(x.monto) : null;
  };
  const cambios = [];
  for (const r of recurrings) {
    if (r.activo === false) continue;
    const desde = pagado(r.id, desdePer), hasta = pagado(r.id, per);
    if (!(desde > 0) || !(hasta > 0)) continue;
    cambios.push({ r, desde, hasta, subio: (hasta - desde) / desde * 100 });
  }
  if (!cambios.length) return null;
  const orden = cambios.map((c) => c.subio).sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  const normal = cambios.length >= 3 ? orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2 : referencia != null ? Number(referencia) : null;
  if (normal == null) return null;
  const casos = cambios.filter((c) => c.subio - normal >= margen).map((c) => ({
    nombre: c.r.nombre,
    moneda: c.r.moneda || "ARS",
    subio: c.subio,
    normal,
    demas: c.hasta - c.desde * (1 + normal / 100)
  })).sort((a, b) => b.demas - a.demas);
  return casos[0] ?? null;
}
var MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];
var nombreDeMes = (per) => MESES_LARGOS[Number(per.slice(5, 7)) - 1];
var mesAnterior = (per) => {
  const [y, m] = per.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
var msg = (tipo, titulo, cuerpo, tag, url = "./#/hoy") => ({ tipo, titulo, cuerpo, tag, url });

// supabase/functions/_shared/push.ts
var b64uABytes = (s) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
var bytesAB64u = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
var unir = (...partes) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};
var texto = (s) => new TextEncoder().encode(s);
async function firmaVapid(endpoint, claves) {
  const { origin } = new URL(endpoint);
  const cabecera = { typ: "JWT", alg: "ES256" };
  const cuerpo = {
    aud: origin,
    exp: Math.floor(Date.now() / 1e3) + 12 * 3600,
    sub: claves.contacto
  };
  const sinFirma = `${bytesAB64u(texto(JSON.stringify(cabecera)))}.${bytesAB64u(texto(JSON.stringify(cuerpo)))}`;
  const pub = b64uABytes(claves.publica);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    ext: true,
    x: bytesAB64u(pub.slice(1, 33)),
    y: bytesAB64u(pub.slice(33, 65)),
    d: claves.privada
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const firma = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    texto(sinFirma)
  ));
  return `${sinFirma}.${bytesAB64u(firma)}`;
}
var hkdf = async (salt, ikm, info, largo) => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    largo * 8
  ));
};
async function cifrar(mensaje, sub) {
  const uaPublic = b64uABytes(sub.p256dh);
  const authSecret = b64uABytes(sub.auth);
  const par = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const compartido = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaKey },
    par.privateKey,
    256
  ));
  const prk = await hkdf(
    authSecret,
    compartido,
    unir(texto("WebPush: info\0"), uaPublic, asPublic),
    32
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, texto("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, texto("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const claro = unir(texto(mensaje), new Uint8Array([2]));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aes,
    claro
  ));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return unir(salt, rs, new Uint8Array([asPublic.length]), asPublic, cifrado);
}
async function enviarPush(sub, aviso, claves) {
  const cuerpo = await cifrar(JSON.stringify(aviso), sub);
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${await firmaVapid(sub.endpoint, claves)}, k=${claves.publica}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400"
    },
    body: cuerpo
  });
  return { ok: r.ok, status: r.status, muerta: r.status === 404 || r.status === 410 };
}
function clavesDelEntorno() {
  if (faltanClaves().length) return null;
  return {
    publica: Deno.env.get("VAPID_PUBLIC").trim(),
    privada: Deno.env.get("VAPID_PRIVATE").trim(),
    contacto: Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:avisos@bishusha.app"
  };
}
function faltanClaves() {
  return ["VAPID_PUBLIC", "VAPID_PRIVATE"].filter((n) => !Deno.env.get(n)?.trim());
}
async function parValido(claves) {
  try {
    const pub = b64uABytes(claves.publica);
    if (pub.length !== 65 || pub[0] !== 4) return false;
    const jwk = {
      kty: "EC",
      crv: "P-256",
      ext: true,
      x: bytesAB64u(pub.slice(1, 33)),
      y: bytesAB64u(pub.slice(33, 65))
    };
    const privada = await crypto.subtle.importKey(
      "jwk",
      { ...jwk, d: claves.privada },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    const publica = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const dato = texto("bishusha");
    const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privada, dato);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publica, firma, dato);
  } catch {
    return false;
  }
}

// supabase/functions/cron-avisos/index.ts
var MAX_POR_VEZ = 2;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const sb = admin();
  const claves = clavesDelEntorno();
  const cuerpo = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (cuerpo.claves || url.searchParams.get("claves")) {
    if (cuerpo.claves && !await usuarioDe(req)) return json({ error: "sin sesi\xF3n" }, 401);
    const par = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
    return json({
      VAPID_PUBLIC: bytesAB64u(pub),
      VAPID_PRIVATE: jwk.d,
      como: [
        "VAPID_PUBLIC va en Cloudflare Pages, como variable de entorno.",
        "VAPID_PRIVATE va en Supabase, en los secretos de las funciones.",
        "VAPID_SUBJECT tambi\xE9n, con tu mail: mailto:vos@ejemplo.com",
        "Guardalas: si las cambi\xE1s, los tel\xE9fonos ya suscriptos dejan de recibir."
      ]
    });
  }
  if (cuerpo.probar) {
    const u = await usuarioDe(req);
    if (!u) return json({ error: "sin sesi\xF3n" }, 401);
    const faltan = faltanClaves();
    const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", u.id);
    const revision = {
      VAPID_PUBLIC: !faltan.includes("VAPID_PUBLIC"),
      VAPID_PRIVATE: !faltan.includes("VAPID_PRIVATE"),
      VAPID_SUBJECT: !!Deno.env.get("VAPID_SUBJECT")?.trim(),
      // La pública es pública por diseño: viaja en cada aviso. Devolverla es
      // lo que permite comparar la de Supabase con la de Cloudflare, que es
      // el error más silencioso de todos.
      publica: claves?.publica ?? null,
      parValido: claves ? await parValido(claves) : false,
      suscripciones: (subs ?? []).length,
      envios: []
    };
    if (!claves) return json({
      enviados: 0,
      revision,
      motivo: `falta ${faltan.join(" y ")} en los secretos de Supabase`
    });
    if (!revision.parValido) return json({
      enviados: 0,
      revision,
      motivo: "VAPID_PUBLIC y VAPID_PRIVATE no son el mismo par: se generaron en dos veces distintas. Gener\xE1 el par de nuevo y pon\xE9 las dos."
    });
    if (!revision.suscripciones) return json({
      enviados: 0,
      revision,
      motivo: "este tel\xE9fono no est\xE1 suscripto: prend\xE9 los avisos desde el tel\xE9fono, con la app agregada a la pantalla de inicio"
    });
    const { enviados, envios } = await mandar(sb, claves, u.id, [{
      tipo: "prueba",
      titulo: "Soy Bishu",
      tag: "prueba",
      url: "./#/hoy",
      cuerpo: "Si ves esto, los avisos te llegan aunque la app est\xE9 cerrada."
    }]);
    revision.envios = envios;
    const rechazo = envios.find((e) => !e.ok);
    return json({
      enviados,
      revision,
      motivo: enviados ? null : rechazo ? `el servicio de push contest\xF3 ${rechazo.status}` + (rechazo.status === 401 || rechazo.status === 403 ? ": la firma no le cierra, casi siempre porque la clave p\xFAblica del navegador no es la del servidor" : rechazo.error ? ` (${rechazo.error})` : "") : "no se pudo mandar"
    });
  }
  const hoy = /* @__PURE__ */ new Date();
  const per = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const mesAntesDe = (p) => {
    const [y, m] = p.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const mesPasado = mesAntesDe(per);
  const hastaHoy = (p) => `${p}-${String(hoy.getDate()).padStart(2, "0")}`;
  const { data: users } = await sb.from("settings").select("user_id, avisos, saldo_minimo, proyeccion");
  const salida = [];
  for (const u of users ?? []) {
    const de = (t) => sb.from(t).select("*").eq("user_id", u.user_id);
    const [cuentas, recurrings, pagos, promos, aumentos] = await Promise.all([
      de("accounts"),
      de("recurrings"),
      // Cuatro meses de pagos y no solo el mes: el aviso de "subió más que el
      // resto" compara contra lo que pagabas tres meses atrás.
      sb.from("recurring_payments").select("*").eq("user_id", u.user_id).gte("periodo", mesAntesDe(mesAntesDe(mesAntesDe(mesPasado)))),
      de("promos"),
      sb.from("notificaciones").select("*").eq("user_id", u.user_id).eq("tipo", "aumento").eq("leida", false)
    ]);
    const dosAtras = mesAntesDe(mesPasado);
    const { data: txs } = await sb.from("transactions").select("*").eq("user_id", u.user_id).gte("fecha", `${dosAtras}-01`);
    const gastado = (p) => (txs ?? []).filter((t) => t.tipo === "gasto" && (t.moneda || "ARS") === "ARS" && t.fecha >= `${p}-01` && t.fecha <= hastaHoy(p)).reduce((s, t) => s + Number(t.monto), 0);
    const salioEnTodo = (p) => (txs ?? []).filter((t) => t.tipo === "gasto" && (t.moneda || "ARS") === "ARS" && String(t.fecha).slice(0, 7) === p).reduce((s, t) => s + Number(t.monto), 0);
    const cuantosEn = (p) => (txs ?? []).filter((t) => String(t.fecha).slice(0, 7) === p).length;
    const mensajes = avisosDelDia({
      prefs: u.avisos ?? {},
      saldoMinimo: Number(u.saldo_minimo) || 0,
      cuentas: cuentas.data ?? [],
      txs: txs ?? [],
      recurrings: recurrings.data ?? [],
      pagos: pagos.data ?? [],
      promos: promos.data ?? [],
      aumentos: aumentos.data ?? [],
      // Sin referencia a mano: con menos de tres fijos comparables el aviso
      // simplemente no sale, que es mejor que salir con un supuesto.
      pagosViejos: pagos.data ?? [],
      gastadoEsteMes: gastado(per),
      gastadoMesPasado: gastado(mesPasado),
      salioMesCerrado: salioEnTodo(mesPasado),
      salioMesAnterior: salioEnTodo(dosAtras),
      movimientosMesCerrado: cuantosEn(mesPasado),
      // La calculó la app: acá solo se lee. Ver js/proyeccion.js.
      proyeccion: u.proyeccion ?? null
    }, hoy);
    if (!mensajes.length) continue;
    await sb.from("notificaciones").insert({
      user_id: u.user_id,
      tipo: "aviso",
      titulo: mensajes[0].titulo,
      cuerpo: mensajes.map((m) => `${m.titulo}: ${m.cuerpo}`).join(" \xB7 ")
    });
    const n = claves ? (await mandar(sb, claves, u.user_id, mensajes.slice(0, MAX_POR_VEZ))).enviados : 0;
    salida.push({ user: u.user_id, avisos: mensajes.map((m) => m.titulo), enviados: n });
  }
  return json({ ok: true, push: !!claves, salida });
});
async function mandar(sb, claves, userId, mensajes) {
  const { data: subs } = await sb.from("push_subscriptions").select("*").eq("user_id", userId);
  const envios = [];
  let enviados = 0;
  for (const s of subs ?? []) {
    const donde = (() => {
      try {
        return new URL(s.endpoint).host;
      } catch {
        return "?";
      }
    })();
    for (const m of mensajes) {
      try {
        const r = await enviarPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          { title: m.titulo, body: m.cuerpo, url: m.url, tag: m.tag },
          claves
        );
        envios.push({ ok: r.ok, status: r.status, donde });
        if (r.ok) enviados++;
        else if (r.muerta) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
          break;
        }
      } catch (e) {
        envios.push({ ok: false, status: null, error: String(e?.message || e), donde });
      }
    }
  }
  return { enviados, envios };
}
