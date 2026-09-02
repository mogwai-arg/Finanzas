-- ---------------------------------------------------------------------
-- 011 — elegir qué avisos llegan al teléfono
--
-- POR QUE: los avisos sirven si son pocos y son los que uno quiere. Sin un
-- lugar donde apagarlos de a uno, el primer aviso que no interesa termina
-- apagando todos.
--
-- Cada clave es un tipo de aviso. Falta una = está prendida: así un tipo
-- nuevo no queda mudo para quien ya tenía sus preferencias guardadas.
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists avisos jsonb not null default '{}'::jsonb;

-- Cuánto tiene que quedar en una cuenta para que Bishu no diga nada.
alter table public.settings add column if not exists saldo_minimo numeric(14,2) not null default 0;

-- La suscripción del teléfono la escribe la app; el cron la lee y, cuando el
-- servicio de push contesta que ya no existe, la borra.
create index if not exists push_user_idx on public.push_subscriptions (user_id);

-- La app guarda la suscripcion del telefono como cualquier otra fila, asi que
-- necesita updated_at para entrar en la sincronizacion incremental.
do $$
begin
  if to_regclass('public.push_subscriptions') is not null then
    alter table public.push_subscriptions
      add column if not exists updated_at timestamptz not null default now();
    drop trigger if exists tocar_push_subscriptions on public.push_subscriptions;
    create trigger tocar_push_subscriptions before update on public.push_subscriptions
      for each row execute function public.tocar_updated_at();
  end if;
end $$;

