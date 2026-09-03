-- =====================================================================
-- 016_proyeccion.sql — la foto de los meses que vienen, para el cron.
--
-- El aviso de "noviembre te aprieta" necesita saber cuánto de lo que entra ya
-- tiene dueño: las cuotas de compras ya hechas más los gastos fijos. Calcular
-- eso del lado del servidor obligaría a portar el cronograma de cuotas y los
-- ciclos de tarjeta a Deno, que es la parte más difícil de la app y ya está
-- escrita dos veces —navegador y pruebas—. Una tercera copia se separa de las
-- otras dos, y el día que se separa el aviso miente.
--
-- Así que la calcula el navegador, que es donde vive esa lógica, y deja acá el
-- resultado. El cron lee la foto. Si la foto es vieja, no avisa: es preferible
-- un aviso que no sale a uno que dice un número de hace dos meses.
--
-- La forma:
--   { calculada: "2026-09-03T12:00:00Z",
--     meses: [{ periodo, entra, comprometido, cuotas, fijos, libre, pct }] }
-- =====================================================================
alter table public.settings
  add column if not exists proyeccion jsonb;

comment on column public.settings.proyeccion is
  'Foto de los meses que vienen calculada por la app: {calculada, meses[]}. '
  'El cron la lee para avisar cuando un mes queda muy comprometido, y la '
  'ignora si está vieja.';
