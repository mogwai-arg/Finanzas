-- =====================================================================
-- Tareas programadas (Supabase > SQL Editor). Requiere pg_cron y pg_net,
-- que se activan desde Database > Extensions.
-- Reemplazá <PROJECT_REF> y <SERVICE_ROLE_KEY> antes de correrlo.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Leer los mails del banco cada 30 minutos
select cron.schedule('gmail-sync', '*/30 * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/gmail-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Mercado Pago, cada 2 horas
select cron.schedule('mp-sync', '0 */2 * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/mp-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Avisos de vencimientos, todos los días a las 9 de la mañana de Buenos Aires (12 UTC)
select cron.schedule('avisos', '0 12 * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-avisos',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

-- Para ver o borrar tareas:
--   select * from cron.job;
--   select cron.unschedule('gmail-sync');
