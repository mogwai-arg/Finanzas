// =====================================================================
// cron-avisos — una vez por día: mira qué hay para avisar y lo manda.
//
// Todo lo que decide QUÉ avisar vive en _shared/avisos.ts y está probado.
// Acá solo pasa lo aburrido: traer los datos, mandar el aviso al teléfono y
// dejar constancia.
//
// Tres formas de entrar:
//   POST (cron)            recorre a todos y avisa
//   POST {probar:true}     con la sesión de la app: manda uno de prueba
//   POST {claves:true}     con la sesión de la app: genera claves VAPID
//   GET  ?claves=1         lo mismo, para quien tenga terminal
// =====================================================================
import { admin, json, CORS, usuarioDe } from '../_shared/comun.ts';
import { avisosDelDia } from '../_shared/avisos.ts';
import { enviarPush, clavesDelEntorno, bytesAB64u } from '../_shared/push.ts';

/** Al teléfono van a lo sumo dos: el resto está en la app cuando la abra. */
const MAX_POR_VEZ = 2;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);

  const sb = admin();
  const claves = clavesDelEntorno();
  const cuerpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  // ------------------------------------------------- claves nuevas
  // Se generan acá y no en una computadora porque no hace falta ninguna: la
  // pública va a Cloudflare (VAPID_PUBLIC) y la privada a los secretos de
  // Supabase (VAPID_PRIVATE). No se guardan en ningún lado: si se pierden,
  // se generan otras y los teléfonos se vuelven a prender.
  //
  // Desde el navegador entra por POST y con sesión: el panel de Supabase
  // rechaza un GET sin Authorization antes de que la función llegue a correr,
  // y apagarle el Verify JWT dejaría el cron abierto a cualquiera.
  if (cuerpo.claves || url.searchParams.get('claves')) {
    if (cuerpo.claves && !(await usuarioDe(req))) return json({ error: 'sin sesión' }, 401);
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' },
                                                true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
    return json({
      VAPID_PUBLIC: bytesAB64u(pub),
      VAPID_PRIVATE: jwk.d,
      como: ['VAPID_PUBLIC va en Cloudflare Pages, como variable de entorno.',
             'VAPID_PRIVATE va en Supabase, en los secretos de las funciones.',
             'VAPID_SUBJECT también, con tu mail: mailto:vos@ejemplo.com',
             'Guardalas: si las cambiás, los teléfonos ya suscriptos dejan de recibir.']
    });
  }

  // ------------------------------------------------- aviso de prueba
  if (cuerpo.probar) {
    const u = await usuarioDe(req);
    if (!u) return json({ error: 'sin sesión' }, 401);
    if (!claves) return json({ enviados: 0, motivo: 'faltan las claves VAPID' });
    const n = await mandar(sb, claves, u.id, [{
      tipo: 'prueba', titulo: 'Soy Bishu', tag: 'prueba', url: './#/hoy',
      cuerpo: 'Si ves esto, los avisos te llegan aunque la app esté cerrada.'
    }]);
    return json({ enviados: n, motivo: n ? null : 'este teléfono no está suscripto' });
  }

  // ------------------------------------------------- la pasada diaria
  const hoy = new Date();
  const per = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const mesPasado = (() => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const hastaHoy = (p: string) => `${p}-${String(hoy.getDate()).padStart(2, '0')}`;

  const { data: users } = await sb.from('settings').select('user_id, avisos, saldo_minimo');
  const salida: unknown[] = [];

  for (const u of users ?? []) {
    const de = (t: string) => sb.from(t).select('*').eq('user_id', u.user_id);
    const [cuentas, recurrings, pagos, promos, aumentos] = await Promise.all([
      de('accounts'), de('recurrings'),
      sb.from('recurring_payments').select('*').eq('user_id', u.user_id).eq('periodo', per),
      de('promos'),
      sb.from('notificaciones').select('*').eq('user_id', u.user_id)
        .eq('tipo', 'aumento').eq('leida', false)
    ]);
    // Los movimientos solo hacen falta para los saldos y para comparar meses:
    // desde el mes pasado alcanza, y es una fracción de la tabla.
    const { data: txs } = await sb.from('transactions').select('*')
      .eq('user_id', u.user_id).gte('fecha', `${mesPasado}-01`);

    const gastado = (p: string) => (txs ?? [])
      .filter(t => t.tipo === 'gasto' && t.moneda === 'ARS' &&
                   t.fecha >= `${p}-01` && t.fecha <= hastaHoy(p))
      .reduce((s, t) => s + Number(t.monto), 0);

    const mensajes = avisosDelDia({
      prefs: u.avisos ?? {}, saldoMinimo: Number(u.saldo_minimo) || 0,
      cuentas: cuentas.data ?? [], txs: txs ?? [],
      recurrings: recurrings.data ?? [], pagos: pagos.data ?? [],
      promos: promos.data ?? [], aumentos: aumentos.data ?? [],
      gastadoEsteMes: gastado(per), gastadoMesPasado: gastado(mesPasado)
    }, hoy);
    if (!mensajes.length) continue;

    // Constancia en la app, para quien no tenga los avisos prendidos.
    await sb.from('notificaciones').insert({
      user_id: u.user_id, tipo: 'aviso',
      titulo: mensajes[0].titulo,
      cuerpo: mensajes.map(m => `${m.titulo}: ${m.cuerpo}`).join(' · ') });

    const n = claves ? await mandar(sb, claves, u.user_id, mensajes.slice(0, MAX_POR_VEZ)) : 0;
    salida.push({ user: u.user_id, avisos: mensajes.map(m => m.titulo), enviados: n });
  }
  return json({ ok: true, push: !!claves, salida });
});

/**
 * Manda los avisos a todos los teléfonos de una persona.
 *
 * Una suscripción que el servicio de push da por muerta se borra: si no,
 * cada corrida vuelve a fallar contra un teléfono que ya no está.
 */
async function mandar(sb: any, claves: any, userId: string, mensajes: any[]) {
  const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', userId);
  let enviados = 0;
  for (const s of subs ?? []) {
    for (const m of mensajes) {
      try {
        const r = await enviarPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          { title: m.titulo, body: m.cuerpo, url: m.url, tag: m.tag }, claves);
        if (r.ok) enviados++;
        else if (r.muerta) { await sb.from('push_subscriptions').delete().eq('id', s.id); break; }
      } catch { /* un teléfono que falla no frena a los demás */ }
    }
  }
  return enviados;
}
