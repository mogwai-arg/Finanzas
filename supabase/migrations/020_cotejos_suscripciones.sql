-- =====================================================================
-- PARTE 20 — las dos columnas que la app escribia y la base no tenia
--
-- La app guardaba estas dos cosas en `settings` desde que se escribieron las
-- pantallas, pero nunca se escribio el SQL que las crea. Postgres rechaza la
-- fila entera con "Could not find the 'cotejos' column of 'settings' in the
-- schema cache", el cambio queda en el cajon de pendientes y la pantalla de
-- Ajustes muestra "1 cambios no se pudieron subir" hasta que se corre esto.
--
--   cotejos       cuando fue la ultima vez que un extracto del banco se
--                 comparo contra lo cargado, por cuenta. Sin esto, cada vez
--                 que se abria la ficha de una cuenta decia que nunca se
--                 habia cotejado, aunque se hubiera hecho el dia anterior.
--
--   suscripciones que suscripcion se pregunto y cuando. La app pregunta una
--                 vez al año "¿seguis usando Spotify?"; sin esto no sabe que
--                 ya la pregunto y vuelve a preguntar todos los meses, que es
--                 exactamente lo que la hace insoportable.
--
-- Las dos son jsonb con objeto vacio por omision: una fila vieja sin la
-- columna se lee igual que una que nunca guardo nada.
-- =====================================================================
alter table public.settings add column if not exists cotejos jsonb not null default '{}'::jsonb;
alter table public.settings add column if not exists suscripciones jsonb not null default '{}'::jsonb;

comment on column public.settings.cotejos is
  'Ultimo cotejo por cuenta: { <account_id>: { cuando, desde, hasta, cuadra, coinciden, total } }.';
comment on column public.settings.suscripciones is
  'Cuando se pregunto por cada gasto fijo: { <recurring_id>: "2026-09-04" }.';
