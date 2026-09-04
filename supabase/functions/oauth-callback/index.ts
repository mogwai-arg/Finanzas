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
    // Del secreto se muestra el largo y si viene con espacios pegados, nunca
    // el valor: alcanza para descartar el error de copiado mas comun.
    const hay = (k: string) => {
      const v = Deno.env.get(k);
      if (!v) return 'FALTA';
      const sucio = v !== v.trim() ? ' · ¡tiene espacios o saltos de línea!' : '';
      return `puesto · ${v.trim().length} caracteres${sucio}`;
    };
    const L = [
      'BISHUSHA · oauth-callback', '',
      'Registrá en Google, letra por letra:', `  ${REDIRECT}`, '',
      `FUNCTIONS_URL         ${Deno.env.get('FUNCTIONS_URL') ?? 'FALTA'}`,
      `APP_URL               ${Deno.env.get('APP_URL') ?? 'FALTA'}`,
      `GOOGLE_CLIENT_ID      ${hay('GOOGLE_CLIENT_ID')}`,
      `GOOGLE_CLIENT_SECRET  ${hay('GOOGLE_CLIENT_SECRET')}`,
      '  el client_id termina en .apps.googleusercontent.com y tiene ~72',
      '  el client_secret empieza con GOCSPX- y tiene 35',
      `MP_CLIENT_ID          ${hay('MP_CLIENT_ID')}`,
      `MP_CLIENT_SECRET      ${hay('MP_CLIENT_SECRET')}`
    ];
    return new Response(L.join('\n') + '\n',
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
    const L = [
      'BISHUSHA · la vuelta de Google no trajo el código', '',
      `Lo que llegó a ${url.pathname}:`,
      ...(partes.length ? partes.map(p => '  ' + p) : ['  nada, ni un parámetro']), '',
      `Método: ${req.method}`,
      `Referer: ${req.headers.get('referer') ?? '(ninguno)'}`, '',
      'Si dice error = access_denied, se cortó el permiso en la pantalla de',
      'Google. Si no llegó nada, esta dirección se abrió sin venir de Google.'
    ];
    return new Response(L.join('\n') + '\n',
      { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  // El numero de un solo uso dice de quien es la sesion y a que proveedor.
  const sb = admin();
  const { data: pendiente, error: errPend } = await sb.from('oauth_pendientes')
    .select('user_id, proveedor, created_at').eq('nonce', nonce).maybeSingle();

  // Y que sea de recien. Los viejos los barre oauth-start, pero solo cuando
  // se empieza OTRA conexion: si no se empieza ninguna, un nonce se queda
  // valido para siempre, y un link de vuelta filtrado hace meses seguiria
  // sirviendo para atar una integracion a esa cuenta. Se comprueba tambien
  // aca, al canjearlo, con la misma ventana de quince minutos —de sobra para
  // tocar "permitir" en Google—.
  const VENTANA = 15 * 60 * 1000;
  const viejo = pendiente &&
    Date.now() - new Date(pendiente.created_at as string).getTime() > VENTANA;
  if (viejo) await sb.from('oauth_pendientes').delete().eq('nonce', nonce);

  if (!pendiente || viejo) {
    // Tres motivos distintos que antes decian todos lo mismo, y solo uno de
    // ellos se arregla probando de nuevo.
    const motivo =
      errPend?.message?.includes('oauth_pendientes')
        ? 'falta correr el SQL 007 en Supabase: no existe la tabla oauth_pendientes'
      : nonce.includes('|')
        ? 'oauth-start quedó en la versión vieja: volvé a pegarla y desplegarla'
      : viejo
        ? 'el permiso caducó: pasaron más de 15 minutos desde que lo pediste, ' +
          'probá de nuevo'
      : errPend
        ? `no pude leer el permiso pendiente: ${errPend.message}`
        : 'el permiso caducó o ya se usó; probá de nuevo';
    return Response.redirect(`${APP}#/ajustes?error=${encodeURIComponent(motivo)}`, 302);
  }
  await sb.from('oauth_pendientes').delete().eq('nonce', nonce);
  const prov = pendiente.proveedor;
  const u = { user: { id: pendiente.user_id } };

  try {
    let tok: any, cuenta = '';
    if (prov === 'gmail') {
      tok = await (await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          // .trim(): copiar y pegar un secreto se lleva un salto de linea o un
          // espacio al final mas seguido de lo que uno cree, y Google contesta
          // "The provided client secret is invalid" sin decir por que.
          code, client_id: (Deno.env.get('GOOGLE_CLIENT_ID') ?? '').trim(),
          client_secret: (Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '').trim(),
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
          client_id: (Deno.env.get('MP_CLIENT_ID') ?? '').trim(),
          client_secret: (Deno.env.get('MP_CLIENT_SECRET') ?? '').trim(),
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
