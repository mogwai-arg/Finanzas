-- =====================================================================
-- 018_dolar.sql — la cotización, y cuándo se trajo.
--
-- `usd_ref` se leía en dos pantallas —"Dónde está la plata" y el hero de Hoy—
-- y no había ningún lugar donde escribirla: existía solo en los datos de la
-- demo. O sea que había dos pantallas con código que nunca corrió, y el total
-- de la plata en pesos más dólares no se pudo ver nunca.
--
-- La fecha va con ella a propósito. Una cotización de hace tres meses hace más
-- daño que ninguna: el total sale mal y nadie sospecha del número, porque un
-- número puesto se lee como un número actual.
-- =====================================================================
alter table public.settings
  add column if not exists usd_ref numeric;

alter table public.settings
  add column if not exists usd_ref_al timestamptz;

alter table public.settings
  add column if not exists usd_ref_de text;

comment on column public.settings.usd_ref is
  'Dólar MEP con el que se valúan en pesos los saldos en dólares.';
comment on column public.settings.usd_ref_al is
  'Cuándo se trajo o se escribió. Sirve para decir que está vieja en vez de '
  'seguir usándola callado.';
comment on column public.settings.usd_ref_de is
  'De qué servicio salió, o vacío si se cargó a mano.';
