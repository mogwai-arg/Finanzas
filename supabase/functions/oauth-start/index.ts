// Arranca el flujo OAuth. Recibe ?proveedor=gmail|mercadopago y el JWT del
// usuario en ?t=, lo canjea por un numero de un solo uso, y manda al
// proveedor con ese numero en `state`.
import { admin, CORS } from '../_shared/comun.ts';

// Sin parametros: Google exige que la direccion de vuelta coincida letra por
// letra con una registrada en la consola, y una registrada con ?proveedor=
// pegado es una fuente de errores segura.
const REDIRECT = `${Deno.env.get('FUNCTIONS_URL')}/oauth-callback`;

const texto = (t: string, status = 200) =>
  new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const prov = url.searchParams.get('proveedor') ?? 'gmail';
  const jwt = url.searchParams.get('t') ?? '';

  // `state` lleva un numero al azar, no la sesion.
  //
  // POR QUE: antes viajaba el JWT entero, unos 900 caracteres. Google acepta
  // la direccion pero no llega a mostrar la pantalla de permisos: rebota al
  // instante, como si se hubiera cancelado. La misma direccion sin JWT
  // funciona. Y de paso, mandar la sesion por los servidores de un tercero y
  // dejarla en el historial del navegador era mala idea igual.
  const sb = admin();
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u.user) return texto('La sesión no llegó hasta acá. Volvé a entrar a BISHUSHA y probá de nuevo.', 401);

  const nonce = crypto.randomUUID().replace(/-/g, '');
  await sb.from('oauth_pendientes').insert({ nonce, user_id: u.user.id, proveedor: prov });
  // Los que quedaron a medias no sirven para nada despues de un rato.
  await sb.from('oauth_pendientes').delete()
    .lt('created_at', new Date(Date.now() - 15 * 60_000).toISOString());

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
      state: nonce
    });
    destino = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
  } else {
    const p = new URLSearchParams({
      client_id: Deno.env.get('MP_CLIENT_ID')!,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: REDIRECT,
      state: nonce
    });
    destino = 'https://auth.mercadopago.com.ar/authorization?' + p;
  }

  // Con ?mostrar=1 no redirige: escribe a donde iba a mandar, para abrir esa
  // direccion a mano en una pestaña con barra de direcciones a la vista.
  if (url.searchParams.get('mostrar')) {
    const g = new URL(destino);
    const filas = [...g.searchParams.entries()].map(([k, v]) => `  ${k.padEnd(22)} ${v}`);
    return texto(
      `BISHUSHA · oauth-start\n\nAbrí esta dirección a mano:\n\n${destino}\n\n` +
      `Desglosada:\n  destino                ${g.origin}${g.pathname}\n${filas.join('\n')}\n\n` +
      `Largo de la dirección: ${destino.length} caracteres.\n` +
      `El client_id empieza con el número del proyecto de Google: tiene que\n` +
      `ser el mismo proyecto donde está habilitada la Gmail API.\n`);
  }

  return Response.redirect(destino, 302);
});
