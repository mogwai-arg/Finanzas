// oauth-start — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/oauth-start/index.ts

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

// supabase/functions/oauth-start/index.ts
var REDIRECT = `${Deno.env.get("FUNCTIONS_URL")}/oauth-callback`;
var texto = (t, status = 200) => new Response(t, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const prov = url.searchParams.get("proveedor") ?? "gmail";
  const jwt = url.searchParams.get("t") ?? "";
  const sb = admin();
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u.user) return texto("La sesi\xF3n no lleg\xF3 hasta ac\xE1. Volv\xE9 a entrar a BISHUSHA y prob\xE1 de nuevo.", 401);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  await sb.from("oauth_pendientes").insert({ nonce, user_id: u.user.id, proveedor: prov });
  await sb.from("oauth_pendientes").delete().lt("created_at", new Date(Date.now() - 15 * 6e4).toISOString());
  let destino;
  if (prov === "gmail") {
    const p = new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID"),
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: nonce
    });
    destino = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  } else {
    const p = new URLSearchParams({
      client_id: Deno.env.get("MP_CLIENT_ID"),
      response_type: "code",
      platform_id: "mp",
      redirect_uri: REDIRECT,
      state: nonce
    });
    destino = "https://auth.mercadopago.com.ar/authorization?" + p;
  }
  if (url.searchParams.get("mostrar")) {
    const g = new URL(destino);
    const filas = [...g.searchParams.entries()].map(([k, v]) => `  ${k.padEnd(22)} ${v}`);
    return texto(
      `BISHUSHA \xB7 oauth-start

Abr\xED esta direcci\xF3n a mano:

${destino}

Desglosada:
  destino                ${g.origin}${g.pathname}
${filas.join("\n")}

Largo de la direcci\xF3n: ${destino.length} caracteres.
El client_id empieza con el n\xFAmero del proyecto de Google: tiene que
ser el mismo proyecto donde est\xE1 habilitada la Gmail API.
`
    );
  }
  return Response.redirect(destino, 302);
});
