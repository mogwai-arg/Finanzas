-- =====================================================================
-- PARTE 23 — a que hora se miro el banco
--
-- Poner el saldo que dice el banco es la forma rapida de volver a estar al
-- dia despues de unos dias sin cargar nada. El problema era que ese numero
-- no quedaba: la app le sumaba y le restaba los movimientos del mismo dia
-- que ya estaban cargados, que YA ESTAN ADENTRO del numero del banco.
-- Se anotaba 1.000.000 y la cuenta mostraba 970.000.
--
-- Arreglarlo excluyendo el dia entero alcanza para el caso comun, pero deja
-- otro peor: si a la tarde se carga un gasto con fecha de hoy, ese gasto no
-- aparece en ningun saldo. Plata que la app cree que no existe.
--
-- Con la hora en que se miro el banco no hay que elegir. Un movimiento
-- fechado el mismo dia cuenta solo si se cargo DESPUES de ese momento:
--
--   cargado antes  -> el banco ya lo tenia, no se vuelve a contar
--   cargado despues -> el banco no lo vio, se suma
--
-- Una fecha sola no puede distinguir esas dos cosas, y la diferencia es
-- plata. Se pone sola, y solo cuando el saldo declarado cambia: si no
-- cambia, sigue valiendo el momento en que se anoto.
--
-- Nula en las cuentas que ya existen. Sin ella se vuelve a la regla del dia
-- entero, que es la lectura razonable de "el saldo al 29": el del cierre
-- del dia.
-- =====================================================================
alter table public.accounts add column if not exists saldo_visto_at timestamptz;

comment on column public.accounts.saldo_visto_at is
  'Cuando se miro el banco para anotar saldo_inicial. Un movimiento del mismo dia que saldo_al cuenta solo si se cargo despues de este momento.';
