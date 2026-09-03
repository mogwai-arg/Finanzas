// =====================================================================
// mp-sync — trae los movimientos de Mercado Pago por su API oficial.
// Nota honesta: la API publica de MP esta pensada para cobros. Segun el
// tipo de cuenta puede no exponer todos los pagos salientes; por eso el
// mail de MP sigue funcionando como respaldo en gmail-sync.
// =====================================================================
import { admin, json, CORS } from '../_shared/comun.ts';
import { yaEstaba, loQueSuma } from '../_shared/duplicados.ts';
import { esPagoDeTarjeta, comoPagoDeTarjeta } from '../_shared/pagos.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = admin();
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  let q = sb.from('integrations').select('*').eq('proveedor', 'mercadopago').eq('activo', true);
  if (body.user_id) q = q.eq('user_id', body.user_id);
  const { data: integraciones } = await q;

  const out: unknown[] = [];
  for (const it of integraciones ?? []) {
    try { out.push(await traer(sb, it)); }
    catch (e) {
      await sb.from('integrations').update({ ultimo_error: String(e) }).eq('id', it.id);
      out.push({ user: it.user_id, error: String(e) });
    }
  }
  return json({ ok: true, out });
});

async function traer(sb: any, it: any) {
  const token = await accessToken(sb, it);
  const desde = it.ultima_sync ?? new Date(Date.now() - 30 * 864e5).toISOString();

  const url = 'https://api.mercadopago.com/v1/payments/search?' + new URLSearchParams({
    sort: 'date_created', criteria: 'desc', limit: '100',
    'range': 'date_created', 'begin_date': desde, 'end_date': 'NOW'
  });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`mp ${r.status}: ${await r.text()}`);
  const data = await r.json();

  const { data: cuentas } = await sb.from('accounts').select('*').eq('user_id', it.user_id);
  const cuentaMP = (cuentas ?? []).find((c: any) => /mercado ?pago/i.test(c.nombre));
  let cargados = 0, adoptados = 0;
  const nuevos: string[] = [];

  // Lo que ya está cargado en esa ventana, venga de donde venga. El mismo pago
  // llega por el mail de MP y por esta API con identificadores distintos: para
  // la base son dos filas, y el mes queda inflado. Tener las dos puertas vale
  // la pena —una tapa lo que la otra no ve— pero hay que reconocer cuándo
  // dicen lo mismo.
  const { data: previos } = await sb.from('transactions').select('*')
    .eq('user_id', it.user_id).gte('fecha', String(desde).slice(0, 10));

  for (const p of data.results ?? []) {
    if (p.status !== 'approved') continue;
    const esGasto = String(p.payer?.id ?? '') === String(it.cuenta);
    const monto = Number(p.transaction_amount ?? 0);
    if (!(monto > 0)) continue;

    let fila: any = {
      user_id: it.user_id,
      fecha: String(p.date_approved ?? p.date_created).slice(0, 10),
      descripcion: p.description ?? 'Mercado Pago',
      comercio: p.description ?? (esGasto ? p.collector_id : p.payer?.email) ?? 'Mercado Pago',
      monto, moneda: p.currency_id === 'USD' ? 'USD' : 'ARS',
      tipo: esGasto ? 'gasto' : 'ingreso',
      cuotas: Number(p.installments ?? 1),
      account_id: cuentaMP?.id ?? null,
      fuente: 'mercadopago', externo_id: String(p.id),
      revisado: false, confianza: 95
    };

    // Pagar la tarjeta no es un gasto: es plata que sale de una cuenta y salda
    // la tarjeta. Cargarlo como gasto dejaba el resumen figurando impago —solo
    // cuentan las movidas con destino a la tarjeta— y encima inflaba el mes,
    // contando las compras y después el pago de esas mismas compras.
    const tarjeta = esPagoDeTarjeta(
      `${fila.descripcion} ${fila.comercio} ${p.payment_method_id ?? ''}`, cuentas ?? []);
    if (tarjeta) fila = comoPagoDeTarjeta(fila, tarjeta);
    // ¿Ya estaba, por el mail o cargado a mano? Se completa esa fila en vez de
    // crear otra, y no se pisa nada de lo que hayas tocado vos.
    const previo = yaEstaba(fila, previos ?? []);
    if (previo) {
      const suma = loQueSuma(previo, fila);
      if (suma) await sb.from('transactions').update(suma).eq('id', (previo as any).id);
      adoptados++;
      continue;
    }

    const { error } = await sb.from('transactions').insert(fila);
    if (error) { if (error.code !== '23505') console.error(error); continue; }
    (previos ?? []).push(fila as any);   // para no duplicar dentro del mismo lote
    cargados++;
    nuevos.push(`${fila.comercio} $${monto.toLocaleString('es-AR')}`);
  }

  await sb.from('integrations')
    .update({ ultima_sync: new Date().toISOString(), ultimo_error: null }).eq('id', it.id);
  if (cargados) {
    await sb.from('notificaciones').insert({
      user_id: it.user_id, tipo: 'carga_auto',
      titulo: `${cargados} de Mercado Pago`, cuerpo: nuevos.slice(0, 4).join(' · ') });
  }
  return { user: it.user_id, cargados, adoptados };
}

async function accessToken(sb: any, it: any) {
  if (it.expira_at && new Date(it.expira_at) > new Date(Date.now() + 60000)) return it.access_token;
  if (!it.refresh_token) return it.access_token;
  const r = await (await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: Deno.env.get('MP_CLIENT_ID'),
      client_secret: Deno.env.get('MP_CLIENT_SECRET'),
      grant_type: 'refresh_token', refresh_token: it.refresh_token })
  })).json();
  if (r.error) throw new Error('refresh mp: ' + (r.message ?? r.error));
  await sb.from('integrations').update({ access_token: r.access_token,
    refresh_token: r.refresh_token ?? it.refresh_token,
    expira_at: new Date(Date.now() + (r.expires_in ?? 3600) * 1000).toISOString() }).eq('id', it.id);
  return r.access_token;
}
