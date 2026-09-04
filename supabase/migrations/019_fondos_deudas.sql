-- =====================================================================
-- 019_fondos_deudas.sql — lo que no cae todos los meses, y lo que debés.
--
-- FONDOS. El seguro del auto, la patente, la matrícula, las vacaciones: cosas
-- que no caen todos los meses y que cuando llegan aparecen como una sorpresa
-- aunque se supieran desde enero. Un fondo es un objetivo con fecha; la app
-- calcula cuánto apartar por mes y si vas atrasado.
--
-- Los aportes van adentro, en jsonb, como los ciclos de una tarjeta: son pocos
-- —uno por mes— y siempre se leen junto con el fondo. Una tabla aparte sería
-- otra sincronización y otras políticas para guardar dos números.
--
-- DEUDAS. Solo lo que se debe, en las dos direcciones. Los bienes quedan
-- afuera a propósito: un auto o un departamento tasados a mano envejecen mal y
-- terminan siendo una planilla que nadie actualiza, inflando un patrimonio que
-- nadie puede gastar.
-- =====================================================================

create table if not exists public.fondos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nombre        text not null,
  objetivo      numeric not null default 0,
  fecha_objetivo date,
  moneda        text not null default 'ARS',
  -- Dónde está esa plata. Sirve para no contarla dos veces y para saber si
  -- está en la cuenta que rinde.
  account_id    uuid references public.accounts(id) on delete set null,
  -- [{ fecha: '2026-09-04', monto: 40000 }]
  aportes       jsonb not null default '[]'::jsonb,
  icono         text,
  activo        boolean not null default true,
  orden         integer,
  updated_at    timestamptz not null default now()
);

create table if not exists public.deudas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nombre      text not null,
  monto       numeric not null default 0,
  moneda      text not null default 'ARS',
  -- 'debo' = plata que tenés que devolver. 'medeben' = plata que te deben.
  -- Se guardan juntas porque son la misma pregunta mirada de los dos lados.
  direccion   text not null default 'debo' check (direccion in ('debo','medeben')),
  vence       date,
  notas       text,
  saldada     boolean not null default false,
  orden       integer,
  updated_at  timestamptz not null default now()
);

alter table public.fondos enable row level security;
alter table public.deudas enable row level security;

do $$ begin
  create policy "fondos propios" on public.fondos
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "deudas propias" on public.deudas
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists fondos_user_idx on public.fondos(user_id);
create index if not exists deudas_user_idx on public.deudas(user_id);

-- updated_at automático: sin él la sincronización incremental —que pide solo
-- lo que cambió con .gt('updated_at', ...)— trae la tabla una vez y nunca más.
-- Es el mismo trigger que usa todo el resto, con el nombre que ya tiene.
do $$
declare t text;
begin
  foreach t in array array['fondos','deudas']
  loop
    execute format('drop trigger if exists tocar_%I on public.%I', t, t);
    execute format('create trigger tocar_%I before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
  end loop;
end $$;
