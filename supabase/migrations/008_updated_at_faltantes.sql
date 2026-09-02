-- ---------------------------------------------------------------------
-- 008 — updated_at en las tablas que se habian quedado afuera
--
-- POR QUE: la sincronizacion incremental pide solo lo que cambio desde la
-- ultima vez, con .gt('updated_at', ...). Una tabla sin esa columna hace
-- fallar la consulta, el error se anota en la consola y la tabla queda sin
-- traer. Nunca se rompe nada a la vista: simplemente esos datos no llegan.
--
-- Se notaba asi: se conecta Gmail, la cuenta queda guardada en la base, y
-- Ajustes sigue ofreciendo "Conectar Gmail" porque la fila de integrations
-- no baja nunca. Lo mismo pasaba, sin que nadie lo viera, con los pagos de
-- gastos fijos, los usos de promos y los avisos.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['integrations', 'notificaciones', 'recurring_payments',
                           'promo_usos', 'promo_sucursales']
  loop
    -- to_regclass evita explotar si alguna todavia no existe en esta base.
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
      execute format('drop trigger if exists tocar_%I on public.%I', t, t);
      execute format('create trigger tocar_%I before update on public.%I
                      for each row execute function public.tocar_updated_at()', t, t);
    end if;
  end loop;
end $$;
