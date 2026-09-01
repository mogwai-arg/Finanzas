-- =====================================================================
-- PARTE 4 — transferencias entre cuentas propias
--
-- El extracto del 01/09 muestra $ 823.133 saliendo de la cuenta, pero solo
-- $ 84.453 son gasto: $ 715.580 son transferencias a billeteras propias y
-- $ 23.100 una compra de dolares. Esa plata no se gasto, cambio de lugar.
--
-- Sin este tipo de movimiento la app infla el gasto del dia diez veces, y
-- despues lo cuenta OTRA VEZ cuando esa misma plata se gasta desde la
-- billetera. Es el error clasico de las apps de gastos.
-- =====================================================================

alter table public.transactions drop constraint if exists transactions_tipo_check;
alter table public.transactions add constraint transactions_tipo_check
  check (tipo in ('gasto','ingreso','transferencia'));

-- A donde va la plata. Solo para tipo = 'transferencia'.
alter table public.transactions add column if not exists destino_account_id uuid
  references public.accounts(id) on delete set null;

-- Cuando la transferencia cambia de moneda —comprar dolares es transferir de
-- una cuenta en pesos a una en dolares— el destino recibe otro importe. De la
-- relacion entre los dos sale el tipo de cambio real de la operacion, sin
-- tener que preguntarlo ni buscar la cotizacion del dia.
alter table public.transactions add column if not exists monto_destino  numeric(14,2);
alter table public.transactions add column if not exists moneda_destino text
  check (moneda_destino is null or moneda_destino in ('ARS','USD'));

-- Una transferencia necesita destino; un gasto o un ingreso no lo admiten.
alter table public.transactions drop constraint if exists transferencia_coherente;
alter table public.transactions add constraint transferencia_coherente check (
  (tipo = 'transferencia' and destino_account_id is not null
                          and destino_account_id <> account_id)
  or (tipo <> 'transferencia' and destino_account_id is null)
);

create index if not exists tx_destino_idx on public.transactions (user_id, destino_account_id)
  where destino_account_id is not null;

-- Saldo de arranque de cada cuenta, para no tener que cargar la historia entera.
alter table public.accounts add column if not exists saldo_inicial numeric(14,2) default 0;
alter table public.accounts add column if not exists saldo_al date;
