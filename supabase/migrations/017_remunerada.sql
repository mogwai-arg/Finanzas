-- =====================================================================
-- 017_remunerada.sql — cuánto rinde la plata quieta.
--
-- Mercado Pago, Personal Pay y el FIMA de Galicia pagan un rendimiento diario
-- sobre el saldo. Es plata que se gana sin hacer nada y que, con inflación,
-- es la diferencia entre perder poder de compra despacio o rápido.
--
-- La tasa es variable y cambia seguido, así que se guarda por cuenta y a mano:
-- inventarla o traerla de algún lado sería peor, porque un número viejo se
-- cree igual que uno nuevo.
--
-- `tna` es la tasa nominal anual en por ciento: 32 quiere decir 32 %.
-- Vacía significa que esa cuenta no rinde, que es el caso de la caja de
-- ahorro común y del efectivo.
-- =====================================================================
alter table public.accounts
  add column if not exists tna numeric;

alter table public.accounts drop constraint if exists accounts_tna_check;
alter table public.accounts add constraint accounts_tna_check
  check (tna is null or (tna >= 0 and tna <= 400));

comment on column public.accounts.tna is
  'Tasa nominal anual en por ciento que paga la cuenta por el saldo (32 = 32 %). '
  'Vacía = no rinde. Es variable: la actualiza la persona cuando cambia.';

alter table public.accounts
  add column if not exists tna_al date;

comment on column public.accounts.tna_al is
  'Cuándo se cargó esa tasa. Sirve para avisar que está vieja en vez de '
  'seguir calculando con un número de hace tres meses.';
