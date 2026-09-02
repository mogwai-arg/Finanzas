-- ---------------------------------------------------------------------
-- 009 — que un aviso pueda traer datos, no solo texto
--
-- POR QUE: cuando la app detecta que subio la cuota del colegio, el aviso
-- tiene que poder decir "de 235.000 a 259.000 desde septiembre" de una forma
-- que el boton "Actualizar" pueda usar. Con titulo y cuerpo sueltos habria
-- que volver a leer el texto para saber el numero.
-- ---------------------------------------------------------------------
alter table public.notificaciones add column if not exists datos jsonb;

-- Un aviso por gasto fijo y por valor: si el mail se relee, se pisa el mismo.
create unique index if not exists notif_aumento_idx
  on public.notificaciones (user_id, ref_id, ((datos->>'monto')))
  where tipo = 'aumento';
