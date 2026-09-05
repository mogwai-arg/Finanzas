-- =====================================================================
-- PARTE 21 — lo que dice el banco de un resumen que todavia no cerro
--
-- El resumen no se puede bajar hasta que cierra, pero el saldo en curso la
-- app del banco lo muestra desde el dia uno. Y no siempre coincide: un
-- consumo que no llego por correo, un ajuste, una compra vieja que entro en
-- este ciclo. Cien mil pesos de diferencia y ninguna forma de encontrar
-- donde estan.
--
-- Se anota lo que dice el banco y ESE pasa a ser el total: es el que se paga.
-- Lo cargado no se toca ni se le inventa una fila —eso seria plata sin
-- comprobante—; la diferencia queda escrita al lado, con nombre, hasta que
-- llegue el resumen y se pueda cerrar.
--
--   { "<account_id>": { "2026-09": { monto, cuando } } }
--
-- Por periodo de VENCIMIENTO, que es como se identifica un resumen en toda
-- la app. Al importar el resumen de ese periodo, la app compara y lo borra.
-- =====================================================================
alter table public.settings
  add column if not exists saldos_tarjeta jsonb not null default '{}'::jsonb;

comment on column public.settings.saldos_tarjeta is
  'Lo que dice el banco de un resumen en curso: { <account_id>: { <periodo>: { monto, cuando } } }.';
