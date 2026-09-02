-- ---------------------------------------------------------------------
-- 010 — poder elegir que promo te avise
--
-- POR QUE: hay promos que son una vez al mes (la de combustible de Galicia
-- cae un solo dia, el 10 de septiembre) y otras que son todos los jueves.
-- Mostrarlas todas en Hoy seria ruido y no mostrarlas es no enterarse: hace
-- falta un lugar donde decir "de esta avisame".
-- ---------------------------------------------------------------------
alter table public.promos add column if not exists recordar boolean not null default false;

-- Las promos marcadas se buscan por dia; sin indice el cron las recorre todas.
create index if not exists promos_recordar_idx
  on public.promos (user_id, recordar) where recordar;
