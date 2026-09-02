-- =====================================================================
-- PARTE 5 — paritarias y sumas no remunerativas, cargables desde la app
--
-- Hasta ahora el acuerdo vivia en el codigo. En Argentina se firma uno cada
-- tres o cuatro meses, asi que tiene que poder cargarse sin tocar la app.
-- =====================================================================

create table if not exists public.paritarias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  nombre      text not null,                 -- 'Acuerdo julio 2026'
  convenio    text,                          -- 'CCT 130/75'

  -- Un acuerdo argentino casi nunca es "X % por mes". Suele ser "X % en
  -- julio, agosto y septiembre, NO acumulativo, sobre la base de junio".
  -- La diferencia no es teorica: no acumulativo, el salto mensual BAJA.
  base        text not null,                 -- 'YYYY-MM' del sueldo base
  acumulativo boolean not null default false,
  tramos      jsonb not null default '[]',   -- [{ "periodo": "2026-07", "pct": 1.9 }, ...]

  -- Cuando se termina el acuerdo hay revision: lo que venga despues es una
  -- suposicion, no un dato, y la app tiene que poder decirlo.
  revision_en text,                          -- 'YYYY-MM'

  url         text,                          -- de donde salio, para poder verificarlo
  notas       text,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists paritarias_idx on public.paritarias (user_id, base desc);

-- Sumas fijas no remunerativas, con vigencia.
-- El bono del acuerdo de julio 2026 se pago SOLO en julio y agosto: sin
-- declarar el `hasta`, la proyeccion lo sigue sumando para siempre.
create table if not exists public.sumas_nr (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  concepto   text not null,
  monto      numeric(14,2) not null default 0,
  desde      text,                           -- 'YYYY-MM' inclusive; null = siempre
  hasta      text,                           -- 'YYYY-MM' inclusive; null = sin fin
  paritaria_id uuid references public.paritarias(id) on delete set null,
  activo     boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists sumas_nr_idx on public.sumas_nr (user_id, desde);

-- updated_at automatico, igual que el resto
do $$
declare t text;
begin
  foreach t in array array['paritarias','sumas_nr']
  loop
    execute format('drop trigger if exists tocar_%I on public.%I', t, t);
    execute format('create trigger tocar_%I before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_all" on public.%I', t);
    execute format($f$create policy "own_all" on public.%I
                      for all using (user_id = auth.uid())
                      with check (user_id = auth.uid())$f$, t);
  end loop;
end $$;
