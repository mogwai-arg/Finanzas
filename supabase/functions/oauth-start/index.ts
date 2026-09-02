// Arranca el flujo OAuth. Recibe ?proveedor=gmail|mercadopago y el JWT del usuario
// en ?t= (para poder volver sabiendo de quien es la cuenta).
import { CORS } from '../_shared/comun.ts';

// Sin parametros: Google exige que la direccion de vuelta coincida letra por
// letra con una registrada en la consola, y una registrada con ?proveedor=
// pegado es una fuente de errores segura. De que proveedor se trata viaja en
// `state`, que es justamente para eso.
const REDIRECT = `${Deno.env.get('FUNCTIONS_URL')}/oauth-callback`;

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const prov = url.searchParams.get('proveedor') ?? 'gmail';
  // `state` lleva las dos cosas: quien autoriza y a que proveedor.
  const estado = `${prov}|${url.searchParams.get('t') ?? ''}`;

  let destino: string;
  if (prov === 'gmail') {
    const p = new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: estado
    });
    destino = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
  } else {
    const p = new URLSearchParams({
      client_id: Deno.env.get('MP_CLIENT_ID')!,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: REDIRECT,
      state: estado
    });
    destino = 'https://auth.mercadopago.com.ar/authorization?' + p;
  }
  return Response.redirect(destino, 302);
});
