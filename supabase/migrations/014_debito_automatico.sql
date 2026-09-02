-- ---------------------------------------------------------------------
-- 014 — distinguir el débito automático del gasto que uno paga a mano
--
-- POR QUE: la cuenta de un gasto fijo servía para dos cosas distintas y no
-- alcanzaba para ninguna. Spotify se debita SOLO en la tarjeta: no hay nada
-- que hacer y el consumo va a caer en el resumen sí o sí. El colegio se paga
-- a mano, y según el mes sale por transferencia o con la tarjeta: hay que
-- acordarse de pagarlo, y con qué se paga se decide ese día.
--
-- Tratarlos igual rompe de los dos lados: o te olvidás de pagar el colegio
-- porque la app lo daba por debitado, o Spotify aparece como pendiente todos
-- los meses y encima contado dos veces, adentro del resumen y afuera.
-- ---------------------------------------------------------------------
alter table public.recurrings
  add column if not exists debito_automatico boolean not null default false;

comment on column public.recurrings.debito_automatico is
  'true = cae solo en account_id. false = lo pagás vos, y account_id es solo la sugerencia.';
