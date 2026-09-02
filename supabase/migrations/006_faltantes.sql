-- =====================================================================
-- PARTE 6 — lo que la app usa y todavia no existia en la base
--
-- Salio de auditar el codigo contra el esquema antes del primer deploy.
-- Sin esto, la pantalla de promos y el calculo de ciclos fallan en silencio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TOPE DE REINTEGRO CONSUMIDO
-- Una promo de "25 % de reintegro, hasta $20.000 por mes" deja de ser del
-- 25 % apenas se usa. Sin llevar la cuenta, la app miente: dice 25 % cuando
-- ya solo quedan $ 7.600. Es el dato que ningun banco muestra.
-- ---------------------------------------------------------------------
create table if not exists public.promo_usos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  promo_id   uuid not null references public.promos(id) on delete cascade,
  periodo    text not null,                     -- 'YYYY-MM'
  usado      numeric(14,2) not null default 0,  -- reintegro ya consumido
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (promo_id, periodo)
);
create index if not exists promo_usos_idx on public.promo_usos (user_id, periodo);

-- ---------------------------------------------------------------------
-- CICLOS DECLARADOS DE LA TARJETA
-- En Galicia el cierre NO cae un dia fijo del mes: en el resumen de agosto
-- de 2026 los cierres son 30-jul, 27-ago y 1-oct — todos jueves, con el
-- vencimiento ocho dias despues, pero separados 28 y 35 dias. Con un
-- `cierre_dia` fijo la cuenta da mal casi todos los meses.
--
-- Cada resumen publica seis fechas, incluido el ciclo QUE VIENE. Guardarlas
-- es mas barato y mas exacto que adivinar la regla.
--   [{ "cierre": "2026-08-27", "vence": "2026-09-04" }, ...]
-- ---------------------------------------------------------------------
alter table public.accounts add column if not exists ciclos jsonb not null default '[]';

-- Trigger de updated_at, igual que el resto de las tablas.
do $$
begin
  execute 'drop trigger if exists tocar_promo_usos on public.promo_usos';
  execute 'create trigger tocar_promo_usos before update on public.promo_usos
           for each row execute function public.tocar_updated_at()';
end $$;

alter table public.promo_usos enable row level security;
drop policy if exists "own_all" on public.promo_usos;
create policy "own_all" on public.promo_usos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
