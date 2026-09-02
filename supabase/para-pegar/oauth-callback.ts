// oauth-callback — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/oauth-callback/index.ts

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

// supabase/functions/oauth-callback/index.ts
var REDIRECT = `${Deno.env.get("FUNCTIONS_URL")}/oauth-callback`;
var APP = Deno.env.get("APP_URL") ?? "";
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("salud")) {
    const hay = (k) => {
      const v = Deno.env.get(k);
      if (!v) return "FALTA";
      const sucio = v !== v.trim() ? " \xB7 \xA1tiene espacios o saltos de l\xEDnea!" : "";
      return `puesto \xB7 ${v.trim().length} caracteres${sucio}`;
    };
    const L = [
      "BISHUSHA \xB7 oauth-callback",
      "",
      "Registr\xE1 en Google, letra por letra:",
      `  ${REDIRECT}`,
      "",
      `FUNCTIONS_URL         ${Deno.env.get("FUNCTIONS_URL") ?? "FALTA"}`,
      `APP_URL               ${Deno.env.get("APP_URL") ?? "FALTA"}`,
      `GOOGLE_CLIENT_ID      ${hay("GOOGLE_CLIENT_ID")}`,
      `GOOGLE_CLIENT_SECRET  ${hay("GOOGLE_CLIENT_SECRET")}`,
      "  el client_id termina en .apps.googleusercontent.com y tiene ~72",
      "  el client_secret empieza con GOCSPX- y tiene 35",
      `MP_CLIENT_ID          ${hay("MP_CLIENT_ID")}`,
      `MP_CLIENT_SECRET      ${hay("MP_CLIENT_SECRET")}`
    ];
    return new Response(
      L.join("\n") + "\n",
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  if (!APP) {
    return new Response(
      "Falta el secreto APP_URL en Supabase \u2192 Edge Functions \u2192 Secrets.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  const code = url.searchParams.get("code");
  const nonce = url.searchParams.get("state") ?? "";
  if (!code) {
    const partes = [...url.searchParams.entries()].map(([k, v]) => `${k} = ${v}`);
    const L = [
      "BISHUSHA \xB7 la vuelta de Google no trajo el c\xF3digo",
      "",
      `Lo que lleg\xF3 a ${url.pathname}:`,
      ...partes.length ? partes.map((p) => "  " + p) : ["  nada, ni un par\xE1metro"],
      "",
      `M\xE9todo: ${req.method}`,
      `Referer: ${req.headers.get("referer") ?? "(ninguno)"}`,
      "",
      "Si dice error = access_denied, se cort\xF3 el permiso en la pantalla de",
      "Google. Si no lleg\xF3 nada, esta direcci\xF3n se abri\xF3 sin venir de Google."
    ];
    return new Response(
      L.join("\n") + "\n",
      { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  const sb = admin();
  const { data: pendiente, error: errPend } = await sb.from("oauth_pendientes").select("user_id, proveedor").eq("nonce", nonce).maybeSingle();
  if (!pendiente) {
    const motivo = errPend?.message?.includes("oauth_pendientes") ? "falta correr el SQL 007 en Supabase: no existe la tabla oauth_pendientes" : nonce.includes("|") ? "oauth-start qued\xF3 en la versi\xF3n vieja: volv\xE9 a pegarla y desplegarla" : errPend ? `no pude leer el permiso pendiente: ${errPend.message}` : "el permiso caduc\xF3 o ya se us\xF3; prob\xE1 de nuevo";
    return Response.redirect(`${APP}#/ajustes?error=${encodeURIComponent(motivo)}`, 302);
  }
  await sb.from("oauth_pendientes").delete().eq("nonce", nonce);
  const prov = pendiente.proveedor;
  const u = { user: { id: pendiente.user_id } };
  try {
    let tok, cuenta = "";
    if (prov === "gmail") {
      tok = await (await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          // .trim(): copiar y pegar un secreto se lleva un salto de linea o un
          // espacio al final mas seguido de lo que uno cree, y Google contesta
          // "The provided client secret is invalid" sin decir por que.
          code,
          client_id: (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim(),
          client_secret: (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim(),
          redirect_uri: REDIRECT,
          grant_type: "authorization_code"
        })
      })).json();
      if (tok.error) throw new Error(`Google: ${tok.error_description || tok.error}`);
      const perfil = await (await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${tok.access_token}` } }
      )).json();
      cuenta = perfil.emailAddress ?? "";
    } else {
      tok = await (await fetch("https://api.mercadopago.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: (Deno.env.get("MP_CLIENT_ID") ?? "").trim(),
          client_secret: (Deno.env.get("MP_CLIENT_SECRET") ?? "").trim(),
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT
        })
      })).json();
      if (tok.error) throw new Error(tok.message || tok.error);
      cuenta = String(tok.user_id ?? "");
    }
    await sb.from("integrations").upsert({
      user_id: u.user.id,
      proveedor: prov === "gmail" ? "gmail" : "mercadopago",
      cuenta,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expira_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1e3).toISOString(),
      activo: true,
      ultimo_error: null
    }, { onConflict: "user_id,proveedor" });
    return Response.redirect(`${APP}#/ajustes?ok=${prov}`, 302);
  } catch (e) {
    return Response.redirect(`${APP}#/ajustes?error=${encodeURIComponent(String(e))}`, 302);
  }
});
