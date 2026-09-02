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
    const hay = (k) => Deno.env.get(k) ? "puesto" : "FALTA";
    return new Response(
      `BISHUSHA \xB7 oauth-callback

Registr\xE1 en Google, letra por letra:
  ${REDIRECT}

FUNCTIONS_URL         ${Deno.env.get("FUNCTIONS_URL") ?? "FALTA"}
APP_URL               ${Deno.env.get("APP_URL") ?? "FALTA"}
GOOGLE_CLIENT_ID      ${hay("GOOGLE_CLIENT_ID")}
GOOGLE_CLIENT_SECRET  ${hay("GOOGLE_CLIENT_SECRET")}
MP_CLIENT_ID          ${hay("MP_CLIENT_ID")}
MP_CLIENT_SECRET      ${hay("MP_CLIENT_SECRET")}
`,
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
    return new Response(
      `BISHUSHA \xB7 la vuelta de Google no trajo el c\xF3digo

Lo que lleg\xF3 a ${url.pathname}:
` + (partes.length ? partes.map((p) => "  " + p).join("\n") : "  nada, ni un par\xE1metro") + `

M\xE9todo: ${req.method}
Referer: ${req.headers.get("referer") ?? "(ninguno)"}

Si dice error = access_denied, se cort\xF3 el permiso en la pantalla de
Google. Si no lleg\xF3 nada, esta direcci\xF3n se abri\xF3 sin venir de Google.
`,
      { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
  const sb = admin();
  const { data: pendiente } = await sb.from("oauth_pendientes").select("user_id, proveedor").eq("nonce", nonce).maybeSingle();
  if (!pendiente) return Response.redirect(
    `${APP}#/ajustes?error=${encodeURIComponent("el permiso caduc\xF3 o ya se us\xF3; prob\xE1 de nuevo")}`,
    302
  );
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
          code,
          client_id: Deno.env.get("GOOGLE_CLIENT_ID"),
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET"),
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
          client_id: Deno.env.get("MP_CLIENT_ID"),
          client_secret: Deno.env.get("MP_CLIENT_SECRET"),
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
