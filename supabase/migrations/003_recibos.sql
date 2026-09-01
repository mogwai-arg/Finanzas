-- =====================================================================
-- PARTE 3 — el sueldo se aprende, no se carga
--
-- En Argentina el sueldo cambia todos los meses. Un ingreso fijo escrito a
-- mano queda viejo en treinta dias. Esta tabla guarda los recibos y el
-- modulo js/sueldo.js deduce de ahi el ritmo de la paritaria, la proyeccion
-- de los proximos meses y el aguinaldo.
-- =====================================================================

create table if not exists public.recibos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  periodo         text not null,                    -- 'YYYY-MM' al que corresponde
  concepto        text not null default 'mensual'
                  check (concepto in ('mensual','aguinaldo','extra')),

  -- El basico del convenio. Es el unico numero que sigue a la paritaria de
  -- forma limpia: el neto se ensucia con vacaciones, aguinaldo y dias no
  -- trabajados. Proyectar desde aca y no desde el neto.
  basico          numeric(14,2),

  -- Los tres numeros que definen el recibo. Se separan porque los aportes
  -- NO se calculan igual sobre cada uno:
  --   17 %  (jubilacion 11 + ley 19032 3 + obra social 3) sobre remunerativo
  --   2,5 % (sindicato 2 + FAECYS 0,5)                    sobre el total
  remunerativo    numeric(14,2) not null default 0,
  no_remunerativo numeric(14,2) not null default 0,
  deducciones     numeric(14,2) not null default 0,
  neto            numeric(14,2) not null default 0,

  pagado_el       date,          -- la fecha que imprime el recibo
  acreditado_el   date,          -- cuando entro de verdad al banco
  sobre           numeric(14,2) default 0,   -- parte cobrada en efectivo

  -- Un mes con vacaciones o retroactivo no sirve para aprender la relacion
  -- entre el basico y el bruto: la infla. Se marca y se excluye del promedio.
  atipico         boolean,
  conceptos       text[] default '{}',       -- los renglones tal cual figuran

  estimado        boolean not null default false,  -- true = proyectado, no cobrado
  notas           text,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (user_id, periodo, concepto)
);
create index if not exists recibos_idx on public.recibos (user_id, periodo desc);

-- Parametros del sueldo que no salen del recibo.
alter table public.settings add column if not exists sumas_fijas_nr numeric(14,2) default 0;
alter table public.settings add column if not exists dia_cobro       int default 1;
alter table public.settings add column if not exists sobre_estimado  numeric(14,2) default 0;
alter table public.settings add column if not exists ritmo_paritaria numeric(6,4);

-- updated_at automatico. Es la condicion para sincronizar por diferencia en
-- vez de bajarse las tablas enteras en cada arranque.
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['recibos','transactions','accounts','categories',
                           'recurrings','budgets','promos','reglas']
  loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists tocar_%I on public.%I', t, t);
    execute format('create trigger tocar_%I before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
  end loop;
end $$;

-- RLS
alter table public.recibos enable row level security;
drop policy if exists "own_all" on public.recibos;
create policy "own_all" on public.recibos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
