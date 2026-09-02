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
  // Con ?mostrar=1 no redirige: escribe a donde iba a mandar. Sirve para
  // abrir esa direccion a mano en una pestaña con barra de direcciones a la
  // vista, y ver que contesta Google sin la app ni el service worker en el
  // medio. El client_id no es un secreto: viaja en la URL igual.
  if (url.searchParams.get('mostrar')) {
    const g = new URL(destino);
    const filas = [...g.searchParams.entries()]
      .map(([k, v]) => `  ${k.padEnd(22)} ${k === 'state' ? v.slice(0, 30) + '…' : v}`);
    return new Response(
      `BISHUSHA · oauth-start\n\nAbrí esta dirección a mano:\n\n${destino}\n\n` +
      `Desglosada:\n  destino                ${g.origin}${g.pathname}\n${filas.join('\n')}\n\n` +
      `El client_id empieza con el número del proyecto de Google: tiene que\n` +
      `ser el mismo proyecto donde habilitaste la Gmail API.\n`,
      { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  return Response.redirect(destino, 302);
});
