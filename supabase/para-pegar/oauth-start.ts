// oauth-start — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/oauth-start/index.ts

// supabase/functions/_shared/comun.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
var CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

// supabase/functions/oauth-start/index.ts
var REDIRECT = (p) => `${Deno.env.get("FUNCTIONS_URL")}/oauth-callback?proveedor=${p}`;
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const prov = url.searchParams.get("proveedor") ?? "gmail";
  const estado = url.searchParams.get("t") ?? "";
  let destino;
  if (prov === "gmail") {
    const p = new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID"),
      redirect_uri: REDIRECT("gmail"),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: estado
    });
    destino = "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  } else {
    const p = new URLSearchParams({
      client_id: Deno.env.get("MP_CLIENT_ID"),
      response_type: "code",
      platform_id: "mp",
      redirect_uri: REDIRECT("mercadopago"),
      state: estado
    });
    destino = "https://auth.mercadopago.com.ar/authorization?" + p;
  }
  return Response.redirect(destino, 302);
});
