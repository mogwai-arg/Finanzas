// Recibe el code, lo canjea por tokens y los guarda en `integrations`.
import { admin } from '../_shared/comun.ts';

// Tiene que ser identica a la que mando oauth-start y a la registrada en la
// consola de Google: sin parametros, sin barra al final.
const REDIRECT = `${Deno.env.get('FUNCTIONS_URL')}/oauth-callback`;
// Si APP_URL no esta configurada, redirigir a '/' explota en Deno: pide una
// direccion absoluta. Mejor decirlo que fallar con un error de runtime.
const APP = Deno.env.get('APP_URL') ?? '';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Abrir esta direccion con ?salud=1 dice como quedo configurado todo, sin
  // mostrar ningun secreto: solo si esta puesto o no. Es la forma mas rapida
  // de comparar la direccion de vuelta con la registrada en Google, que es
  // donde se rompe casi siempre.
  if (url.searchParams.get('salud')) {
    const hay = (k: string) => (Deno.env.get(k) ? 'puesto' : 'FALTA');
    return new Response(
      `BISHUSHA · oauth-callback

` +
      `Registrá en Google, letra por letra:
  ${REDIRECT}

` +
      `FUNCTIONS_URL         ${Deno.env.get('FUNCTIONS_URL') ?? 'FALTA'}
` +
      `APP_URL               ${Deno.env.get('APP_URL') ?? 'FALTA'}
` +
      `GOOGLE_CLIENT_ID      ${hay('GOOGLE_CLIENT_ID')}
` +
      `GOOGLE_CLIENT_SECRET  ${hay('GOOGLE_CLIENT_SECRET')}
` +
      `MP_CLIENT_ID          ${hay('MP_CLIENT_ID')}
` +
      `MP_CLIENT_SECRET      ${hay('MP_CLIENT_SECRET')}
`,
      { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (!APP) {
    return new Response('Falta el secreto APP_URL en Supabase → Edge Functions → Secrets.',
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const code = url.searchParams.get('code');
  const nonce = url.searchParams.get('state') ?? '';
  if (!code) {
    // Sin codigo no hay nada que hacer, asi que en vez de rebotar a la app
    // —donde el mensaje se recorta y se mezcla con el estado de la pantalla—
    // se muestra aca mismo todo lo que llego. Es un callejon sin salida a
    // proposito: el unico caso en que conviene ver los datos crudos.
    const partes = [...url.searchParams.entries()]
      .map(([k, v]) => `${k} = ${v}`);
    return new Response(
      `BISHUSHA · la vuelta de Google no trajo el código

` +
      `Lo que llegó a ${url.pathname}:
` +
      (partes.length ? partes.map(p => '  ' + p).join('\n') : '  nada, ni un parámetro') +
      `

Método: ${req.method}
` +
      `Referer: ${req.headers.get('referer') ?? '(ninguno)'}

` +
      `Si dice error = access_denied, se cortó el permiso en la pantalla de
` +
      `Google. Si no llegó nada, esta dirección se abrió sin venir de Google.
`,
      { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  // El numero de un solo uso dice de quien es la sesion y a que proveedor.
  const sb = admin();
  const { data: pendiente } = await sb.from('oauth_pendientes')
    .select('user_id, proveedor').eq('nonce', nonce).maybeSingle();
  if (!pendiente) return Response.redirect(
    `${APP}#/ajustes?error=${encodeURIComponent('el permiso caducó o ya se usó; probá de nuevo')}`, 302);
  await sb.from('oauth_pendientes').delete().eq('nonce', nonce);
  const prov = pendiente.proveedor;
  const u = { user: { id: pendiente.user_id } };

  try {
    let tok: any, cuenta = '';
    if (prov === 'gmail') {
      tok = await (await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
          redirect_uri: REDIRECT, grant_type: 'authorization_code' })
      })).json();
      if (tok.error) throw new Error(`Google: ${tok.error_description || tok.error}`);
      const perfil = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',
        { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
      cuenta = perfil.emailAddress ?? '';
    } else {
      tok = await (await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('MP_CLIENT_ID'), client_secret: Deno.env.get('MP_CLIENT_SECRET'),
          grant_type: 'authorization_code', code, redirect_uri: REDIRECT })
      })).json();
      if (tok.error) throw new Error(tok.message || tok.error);
      cuenta = String(tok.user_id ?? '');
    }

    await sb.from('integrations').upsert({
      user_id: u.user.id, proveedor: prov === 'gmail' ? 'gmail' : 'mercadopago',
      cuenta, access_token: tok.access_token, refresh_token: tok.refresh_token ?? null,
      expira_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      activo: true, ultimo_error: null
    }, { onConflict: 'user_id,proveedor' });

    return Response.redirect(`${APP}#/ajustes?ok=${prov}`, 302);
  } catch (e) {
    return Response.redirect(`${APP}#/ajustes?error=${encodeURIComponent(String(e))}`, 302);
  }
});
