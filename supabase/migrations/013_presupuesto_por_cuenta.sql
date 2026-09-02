-- ---------------------------------------------------------------------
-- 013 — presupuesto por cuenta y objetivo de ahorro
--
-- POR QUE: un tope por categoría contesta "cuánto puedo gastar en comida".
-- No contesta "cuánto quiero que me venga la Visa este mes", que es la otra
-- forma en que uno se pone límites, ni "cuánto quiero ahorrar", que es la
-- razón por la que existen los límites.
--
-- Las tres cosas son lo mismo —un número con un período— así que van en la
-- misma tabla con una columna que dice de qué clase es cada una.
-- ---------------------------------------------------------------------
alter table public.budgets add column if not exists account_id uuid
  references public.accounts(id) on delete cascade;
alter table public.budgets add column if not exists clase text not null default 'categoria';
alter table public.budgets alter column category_id drop not null;

-- La unicidad vieja era por categoría y no deja lugar a las otras dos clases.
alter table public.budgets drop constraint if exists budgets_user_id_periodo_category_id_key;

create unique index if not exists budget_cat_idx
  on public.budgets (user_id, periodo, category_id) where category_id is not null;
create unique index if not exists budget_cuenta_idx
  on public.budgets (user_id, periodo, account_id) where account_id is not null;
-- Un ideal de ahorro por moneda y por mes.
create unique index if not exists budget_ahorro_idx
  on public.budgets (user_id, periodo, moneda) where clase = 'ahorro';
