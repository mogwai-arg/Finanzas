// Arranca el flujo OAuth. Recibe ?proveedor=gmail|mercadopago y el JWT del usuario
// en ?t= (para poder volver sabiendo de quien es la cuenta).
import { CORS } from '../_shared/comun.ts';

const REDIRECT = (p: string) => `${Deno.env.get('FUNCTIONS_URL')}/oauth-callback?proveedor=${p}`;

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const prov = url.searchParams.get('proveedor') ?? 'gmail';
  const estado = url.searchParams.get('t') ?? '';   // JWT del usuario

  let destino: string;
  if (prov === 'gmail') {
    const p = new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      redirect_uri: REDIRECT('gmail'),
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
      redirect_uri: REDIRECT('mercadopago'),
      state: estado
    });
    destino = 'https://auth.mercadopago.com.ar/authorization?' + p;
  }
  return Response.redirect(destino, 302);
});
