// Recibe el code, lo canjea por tokens y los guarda en `integrations`.
import { admin } from '../_shared/comun.ts';

// Tiene que ser identica a la que mando oauth-start y a la registrada en la
// consola de Google: sin parametros, sin barra al final.
const REDIRECT = `${Deno.env.get('FUNCTIONS_URL')}/oauth-callback`;
const APP = Deno.env.get('APP_URL') ?? '/';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  // `state` viene como 'proveedor|jwt'. El ?proveedor= se sigue leyendo por si
  // quedo algun permiso a medias del formato anterior.
  const state = url.searchParams.get('state') ?? '';
  const corte = state.indexOf('|');
  const prov = corte > 0 ? state.slice(0, corte)
                         : (url.searchParams.get('proveedor') ?? 'gmail');
  const jwt = corte > 0 ? state.slice(corte + 1) : state;
  if (!code) {
    // Cuando no hay code, el que sabe por que es Google: puede venir un
    // access_denied porque se toco "Volver a seguridad" en la pantalla de app
    // sin verificar. Decir 'sin_code' escondia justamente el motivo.
    const motivo = url.searchParams.get('error_description') ||
                   url.searchParams.get('error') || 'no vino el código';
    return Response.redirect(`${APP}#/ajustes?error=${encodeURIComponent(motivo)}`, 302);
  }

  const sb = admin();
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u.user) return Response.redirect(
    `${APP}#/ajustes?error=${encodeURIComponent('la sesión no llegó hasta acá; volvé a entrar y probá de nuevo')}`, 302);

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
