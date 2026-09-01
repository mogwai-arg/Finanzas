// =====================================================================
// cron-avisos — corre una vez por dia: vencimientos, presupuesto y push.
// =====================================================================
import { admin, json, CORS } from '../_shared/comun.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = admin();
  const hoy = new Date();
  const per = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const dia = hoy.getDate();

  const { data: users } = await sb.from('settings').select('user_id, alert_pct');
  const avisos: unknown[] = [];

  for (const u of users ?? []) {
    const msgs: string[] = [];

    // --- gastos fijos que vencen en 2 dias o ya vencieron sin pagar
    const { data: recs } = await sb.from('recurrings').select('*').eq('user_id', u.user_id).eq('activo', true);
    const { data: pagos } = await sb.from('recurring_payments').select('*')
      .eq('user_id', u.user_id).eq('periodo', per);
    for (const r of recs ?? []) {
      const pago = (pagos ?? []).find((p: any) => p.recurring_id === r.id && p.pagado_at);
      if (pago) continue;
      const d = r.dia_vencimiento - dia;
      if (d === 2 || d === 0) msgs.push(`${r.nombre} vence ${d === 0 ? 'hoy' : 'en 2 días'}`);
      if (d === -1) msgs.push(`${r.nombre} venció ayer y sigue impago`);
    }

    // --- tarjetas que cierran o vencen
    const { data: tjs } = await sb.from('accounts').select('*')
      .eq('user_id', u.user_id).eq('tipo', 'credito').eq('activo', true);
    for (const t of tjs ?? []) {
      if (t.cierre_dia - dia === 1) msgs.push(`${t.nombre} cierra mañana`);
      if (t.vencimiento_dia - dia === 2) msgs.push(`${t.nombre} vence en 2 días`);
    }

    if (!msgs.length) continue;
    await sb.from('notificaciones').insert({
      user_id: u.user_id, tipo: 'vencimiento',
      titulo: msgs.length === 1 ? msgs[0] : `${msgs.length} vencimientos`,
      cuerpo: msgs.join(' · ') });
    avisos.push({ user: u.user_id, msgs });
  }
  return json({ ok: true, avisos });
});
