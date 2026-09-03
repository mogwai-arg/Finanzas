-- =====================================================================
-- PARTE 15 — la memoria de Bishu
--
-- Bishu elegia una frase de una lista ordenada por urgencia y nada mas: cada
-- vez que abrias la app empezaba de cero. Decia lo mismo tres dias seguidos,
-- y no podia decir lo unico que de verdad sirve —"la semana pasada te
-- pasaste en combustible, esta venis mejor"— porque no sabia que te lo habia
-- dicho.
--
-- Se guarda del lado del servidor y no en el telefono a proposito: la memoria
-- tiene que ser la misma en todos lados, si no cada dispositivo cuenta una
-- historia distinta.
-- =====================================================================
alter table public.settings add column if not exists bishu jsonb not null default '{}'::jsonb;

comment on column public.settings.bishu is
  'Lo que Bishu ya dijo: { dichos: [{ k, ref, valor, cuando }] }. Ultimos 30.';
