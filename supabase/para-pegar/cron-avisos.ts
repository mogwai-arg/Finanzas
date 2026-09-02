// cron-avisos — generado por build-funciones.mjs, no editar a mano.
// El original vive en supabase/functions/cron-avisos/index.ts

// supabase/functions/_shared/comun.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
var admin = () => createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);
var CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
var json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// supabase/functions/cron-avisos/index.ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = admin();
  const hoy = /* @__PURE__ */ new Date();
  const per = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const dia = hoy.getDate();
  const { data: users } = await sb.from("settings").select("user_id, alert_pct");
  const avisos = [];
  for (const u of users ?? []) {
    const msgs = [];
    const { data: recs } = await sb.from("recurrings").select("*").eq("user_id", u.user_id).eq("activo", true);
    const { data: pagos } = await sb.from("recurring_payments").select("*").eq("user_id", u.user_id).eq("periodo", per);
    for (const r of recs ?? []) {
      const pago = (pagos ?? []).find((p) => p.recurring_id === r.id && p.pagado_at);
      if (pago) continue;
      const d = r.dia_vencimiento - dia;
      if (d === 2 || d === 0) msgs.push(`${r.nombre} vence ${d === 0 ? "hoy" : "en 2 d\xEDas"}`);
      if (d === -1) msgs.push(`${r.nombre} venci\xF3 ayer y sigue impago`);
    }
    const { data: tjs } = await sb.from("accounts").select("*").eq("user_id", u.user_id).eq("tipo", "credito").eq("activo", true);
    for (const t of tjs ?? []) {
      if (t.cierre_dia - dia === 1) msgs.push(`${t.nombre} cierra ma\xF1ana`);
      if (t.vencimiento_dia - dia === 2) msgs.push(`${t.nombre} vence en 2 d\xEDas`);
    }
    if (!msgs.length) continue;
    await sb.from("notificaciones").insert({
      user_id: u.user_id,
      tipo: "vencimiento",
      titulo: msgs.length === 1 ? msgs[0] : `${msgs.length} vencimientos`,
      cuerpo: msgs.join(" \xB7 ")
    });
    avisos.push({ user: u.user_id, msgs });
  }
  return json({ ok: true, avisos });
});
