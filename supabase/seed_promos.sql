-- =====================================================================
-- Promos iniciales (CABA / GBA) — relevadas el 01/09/2026
-- Antes de correr esto: reemplazá <TU_USER_ID> por tu id de auth.users.
-- Lo sacás con:  select id, email from auth.users;
--
-- IMPORTANTE: las promos bancarias cambian todo el tiempo y muchas
-- dependen de tu segmento y tu zona. Esto es un punto de partida:
-- confirmá cada una en la app de Galicia o en modo.com.ar/promos antes
-- de contar con ella.
-- =====================================================================

insert into public.promos
  (user_id, titulo, comercio, rubro, emisor, tipo, valor, tope, tope_periodo,
   dias, medio_pago, canal, vigencia_hasta, marcas, osm_filtro, url, notas, activa, favorita)
values
  -- ---------------- MODO (verificadas en modo.com.ar el 01/09/2026)
  ('<TU_USER_ID>', '20% de reintegro en farmacias online', 'Farmacias adheridas', 'farmacia',
   'modo', 'reintegro', 20, 16000, 'semanal', '{}', 'MODO con tarjeta de crédito, débito o prepaga',
   'online', '2026-09-29', '{}', 'amenity=pharmacy',
   'https://www.modo.com.ar/promos/farmacias-jul26',
   'Tope $16.000 por banco por semana. Mínimo de compra $70.000. Solo tiendas online adheridas (FarmaPlus, Farmaonline, Openfarma y otras). Acumulable con otras promos.', true, true),

  ('<TU_USER_ID>', '20% de reintegro en ChangoMás', 'ChangoMás', 'supermercado',
   'modo', 'reintegro', 20, null, 'semanal', '{}', 'MODO', 'ambos', null,
   '{ChangoMás,Changomas,Walmart}', 'shop=supermarket',
   'https://www.modo.com.ar/promos', 'Confirmar tope y días en la ficha de la promo.', true, false),

  ('<TU_USER_ID>', '10% de reintegro en Frávega online', 'Frávega', 'electro',
   'modo', 'reintegro', 10, null, 'mensual', '{}', 'MODO', 'online', null,
   '{Frávega}', 'shop=electronics', 'https://www.modo.com.ar/promos', null, true, false),

  ('<TU_USER_ID>', '9 cuotas sin interés en Frávega', 'Frávega', 'electro',
   'modo', 'cuotas', 9, null, 'por compra', '{}', 'MODO', 'online', null,
   '{Frávega}', 'shop=electronics', 'https://www.modo.com.ar/promos', null, true, false),

  -- ---------------- Banco Galicia (verificar en la app: dependen del segmento)
  ('<TU_USER_ID>', '25% de ahorro en Rappi los sábados', 'Rappi', 'gastronomia',
   'galicia', 'descuento', 25, null, 'semanal', '{6}', 'Tarjeta de crédito Galicia Visa',
   'online', null, '{}', null, 'https://beneficios.galicia.ar/',
   'Publicado en beneficios.galicia.ar. Confirmar tope en la ficha.', true, true),

  ('<TU_USER_ID>', 'Cuotas sin interés en viajes', 'Agencias adheridas', 'otros',
   'galicia', 'cuotas', 12, null, 'por compra', '{}', 'Tarjetas Galicia', 'ambos', null,
   '{}', null, 'https://beneficios.galicia.ar/', null, true, false),

  -- ---------------- Plantillas para completar con lo que uses de verdad
  ('<TU_USER_ID>', 'Reintegro en supermercados', 'Coto', 'supermercado',
   'galicia', 'reintegro', 20, 20000, 'semanal', '{3}', 'Tarjeta Galicia Visa',
   'presencial', null, '{Coto}', 'shop=supermarket', null,
   'PLANTILLA: ajustá el porcentaje, el tope y el día con lo que veas en la app de Galicia.', true, false),

  ('<TU_USER_ID>', 'Reintegro en combustible', 'YPF', 'combustible',
   'modo', 'reintegro', 20, 15000, 'mensual', '{}', 'MODO', 'presencial', null,
   '{YPF}', 'amenity=fuel', 'https://www.modo.com.ar/promos',
   'PLANTILLA: la promo de YPF vigente al 01/09/2026 en MODO era exclusiva de otro banco. Verificá si hay una para Galicia.', true, false);
