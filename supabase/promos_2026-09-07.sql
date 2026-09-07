-- ============================================================================
-- promos_2026-09-07.sql — relevamiento semanal de promos (CABA/GBA, Galicia)
--
-- Reemplazar <TU_USER_ID> por el uuid del usuario y correrlo en el SQL Editor.
--
-- Se puede correr TODAS LAS SEMANAS sin borrar nada: hace upsert por título.
-- Lo que se toca desde la app —recordar, favorita— no se pisa nunca, y las
-- promos del relevamiento anterior que ya no están se apagan (activa=false)
-- en vez de borrarse, así el historial de usos no queda huérfano.
--
-- Necesita la migración 022 (índice único por user_id + titulo).
-- El contrato de la tabla está en docs/promos.md.
-- ============================================================================

begin;

-- El momento del corte: lo que no toque este INSERT es de un relevamiento
-- anterior. `updated_at` lo pone solo un trigger, así que alcanza con mirarlo.
create temporary table _corte as select now() as t;

insert into public.promos
  (user_id, titulo, comercio, rubro, emisor, tipo, valor, tope, tope_periodo,
   dias, medio_pago, canal, vigencia_desde, vigencia_hasta, marcas, osm_filtro,
   url, notas)
values
('<TU_USER_ID>', '20% en Jumbo', 'Jumbo', 'supermercado', 'modo', 'reintegro', 20, 25000, 'banco/mes', '{2,4}', 'MODO', 'ambos', '2026-06-01', '2026-09-30', ARRAY['Jumbo'], 'shop=supermarket', 'https://www.modo.com.ar/promos/jumbo-septiembre26', 'Monto mínimo $100.000. QR o NFC. Galicia confirmado en la ficha.'),
('<TU_USER_ID>', '20% en Disco', 'Disco', 'supermercado', 'modo', 'reintegro', 20, 25000, 'banco/mes', '{5,6}', 'MODO', 'ambos', '2026-07-01', '2026-09-30', ARRAY['Disco'], 'shop=supermarket', 'https://www.modo.com.ar/promos/disco-septiembre26', 'Monto mínimo $100.000. QR o NFC. Galicia confirmado en la ficha.'),
('<TU_USER_ID>', '20% en Vea', 'Vea', 'supermercado', 'modo', 'reintegro', 20, 25000, 'banco/mes', '{5}', 'MODO', 'ambos', '2026-07-01', '2026-09-30', ARRAY['Vea'], 'shop=supermarket', 'https://www.modo.com.ar/promos/vea-septiembre26', 'Monto mínimo $100.000. Solo QR (sin NFC).'),
('<TU_USER_ID>', '20% en DIA', 'Supermercados DIA', 'supermercado', 'modo', 'reintegro', 20, 20000, 'banco/mes', '{5,6}', 'MODO', 'ambos', '2026-06-01', '2026-09-30', ARRAY['DIA','Supermercados DIA'], 'shop=supermarket', 'https://www.modo.com.ar/promos/superdia-septiembre26', 'Monto mínimo $35.000 — el más bajo de los grandes. QR o NFC.'),
('<TU_USER_ID>', '20% en ChangoMás', 'ChangoMás', 'supermercado', 'modo', 'reintegro', 20, 25000, 'banco/mes', '{1}', 'MODO', 'ambos', '2026-05-04', '2026-09-30', ARRAY['ChangoMas','ChangoMás','Walmart'], 'shop=supermarket', 'https://www.modo.com.ar/promos/changomas-julio26', 'Monto mínimo $75.000. QR o NFC. Las de 25% y 30% en ChangoMás son de Supervielle y Credicoop: no aplican.'),
('<TU_USER_ID>', '20% en COTO', 'COTO', 'supermercado', 'modo', 'reintegro', 20, NULL, NULL, '{2}', 'MODO', 'presencial', '2026-09-01', '2026-10-31', ARRAY['Coto','COTO'], 'shop=supermarket', 'https://www.modo.com.ar/promos/20-en-coto-septiembre-2608-745', 'Sin tope y sin monto mínimo. Solo QR presencial.'),
('<TU_USER_ID>', '30% en COTO', 'COTO', 'supermercado', 'modo', 'descuento', 30, NULL, NULL, '{4}', 'MODO', 'presencial', '2026-02-26', '2026-09-25', ARRAY['Coto','COTO'], 'shop=supermarket', 'https://www.modo.com.ar/promos/coto-mar-26', 'Sin tope. Solo NFC (acercar el celular), no sirve el QR. Vence el 25/09.'),
('<TU_USER_ID>', '20% en Makro', 'Makro', 'supermercado', 'modo', 'reintegro', 20, 20000, 'banco/mes', '{4}', 'MODO', 'presencial', '2026-06-01', '2026-09-30', ARRAY['Makro'], 'shop=supermarket', 'https://www.modo.com.ar/promos/makro-septiembre26', 'Sin monto mínimo declarado en la ficha. Solo QR presencial.'),
('<TU_USER_ID>', '20% en Supercoop', 'Supercoop', 'supermercado', 'modo', 'reintegro', 20, 10000, 'usuario/semana', '{5,6,0}', 'MODO', 'presencial', '2026-05-01', '2026-10-31', ARRAY['Supercoop'], 'shop=supermarket', 'https://www.modo.com.ar/promos/supercoop-septiembre26', 'Cadena de CABA. Tope SEMANAL: se renueva los lunes. Monto mínimo $40.000.'),
('<TU_USER_ID>', '20% en MasGo', 'MasGo', 'supermercado', 'modo', 'reintegro', 20, 20000, 'banco/mes', '{0}', 'MODO', 'presencial', '2026-08-16', '2026-10-31', ARRAY['MasGo','Mas Go'], 'shop=supermarket', 'https://www.modo.com.ar/promos/masgo-agos26', 'Solo domingos. Monto mínimo $30.000. QR o NFC.'),
('<TU_USER_ID>', '15% en Diarco Mayorista', 'Diarco', 'supermercado', 'modo', 'descuento', 15, NULL, NULL, '{6,0}', 'MODO', 'presencial', '2026-09-05', '2026-09-27', ARRAY['Diarco'], 'shop=supermarket', 'https://www.modo.com.ar/promos/diarco-mayorista-sep-26', 'Sin tope pero con monto mínimo $100.000. Ventana corta: termina el 27/09.'),
('<TU_USER_ID>', '25% en The Food Market online', 'The Food Market', 'supermercado', 'modo', 'reintegro', 25, 15000, 'usuario/mes', '{4}', 'MODO', 'online', '2026-08-03', '2026-10-31', ARRAY['The Food Market'], 'shop=supermarket', 'https://www.modo.com.ar/promos/25off-thefoodmarket-galicia-1-ago26', 'EXCLUSIVA GALICIA. Solo online, jueves.'),
('<TU_USER_ID>', '20% en farmacias online', 'Farmacias adheridas', 'salud', 'modo', 'reintegro', 20, 16000, 'banco/semana', '{2}', 'MODO', 'online', '2026-07-07', '2026-09-29', ARRAY['Farmacity','Farmaonline','FarmaPlus','Farmacia Selma'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/farmacias-jul26', 'Tope SEMANAL: se renueva los lunes. Monto mínimo $70.000. Listado completo de farmacias adheridas: verificar en la app de MODO.'),
('<TU_USER_ID>', '20% en Farmacity online', 'Farmacity', 'salud', 'modo', 'reintegro', 20, 16000, 'banco/semana', '{2}', 'MODO', 'online', '2026-07-07', '2026-09-30', ARRAY['Farmacity'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/farmacity-jul26', 'Tope SEMANAL. Monto mínimo $70.000. Solo compras online.'),
('<TU_USER_ID>', '25% en Farmacity online', 'Farmacity', 'salud', 'modo', 'reintegro', 25, 15000, 'usuario/mes', '{4}', 'MODO', 'online', '2026-08-03', '2026-10-31', ARRAY['Farmacity'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/25off-farmacity-galicia-1-ago26', 'EXCLUSIVA GALICIA. Mejor que la del martes si se puede esperar al jueves.'),
('<TU_USER_ID>', '20% en perfumerías online', 'Perfumerías adheridas', 'salud', 'modo', 'reintegro', 20, 20000, 'banco/semana', '{1}', 'MODO', 'online', '2026-07-06', '2026-09-28', ARRAY['Juleriaque','Perfumerias Rouge','Get the Look','Pigmento'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/perfumerias-jul26', 'Tope SEMANAL. Monto mínimo $70.000. Marcas adheridas: listado sin confirmar, verificar en la app.'),
('<TU_USER_ID>', '15% en FarmaPlus online', 'FarmaPlus', 'salud', 'modo', 'reintegro', 15, 9000, 'banco/semana', '{1}', 'MODO', 'online', '2026-08-03', '2026-09-28', ARRAY['FarmaPlus','Farma Plus'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/farmaplus-agos26', 'Tope SEMANAL. Monto mínimo $60.000.'),
('<TU_USER_ID>', '10% en Farmacia Selma', 'Farmacia Selma', 'salud', 'modo', 'reintegro', 10, 8000, 'banco/mes', '{1,3}', 'MODO', 'ambos', '2026-07-01', '2026-09-30', ARRAY['Selma','Farmacia Selma'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/selma-septiembre26', 'Monto mínimo $75.000 — alto para el 10%. Sirve más la de 3 CSI.'),
('<TU_USER_ID>', '15% en Farmacias del Puente', 'Farmacias del Puente', 'salud', 'modo', 'reintegro', 15, 5000, 'banco/semana', '{6}', 'MODO', 'ambos', '2026-08-08', '2026-09-26', ARRAY['Del Puente','Farmacias del Puente'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/farmacia-del-puente-septiembre26', 'Tope SEMANAL. Monto mínimo $30.000 — el más accesible de las farmacias.'),
('<TU_USER_ID>', '25% en Simplicity online', 'Simplicity', 'salud', 'modo', 'reintegro', 25, 15000, 'usuario/mes', '{4}', 'MODO', 'online', '2026-08-03', '2026-10-31', ARRAY['Simplicity'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/25off-simplicity-galicia-1-ago26', 'EXCLUSIVA GALICIA.'),
('<TU_USER_ID>', '25% en Get the Look online', 'Get the Look', 'salud', 'modo', 'reintegro', 25, 15000, 'usuario/mes', '{4}', 'MODO', 'online', '2026-08-03', '2026-10-31', ARRAY['Get the Look','Get The Look'], 'amenity=pharmacy', 'https://www.modo.com.ar/promos/25off-gethelook-galicia-1-ago26', 'EXCLUSIVA GALICIA.'),
('<TU_USER_ID>', '50% en transporte con Mastercard', 'Transporte público', 'otros', 'modo', 'reintegro', 50, 15000, 'tarjeta/mes', '{}', 'MODO NFC', 'presencial', '2026-08-17', '2026-09-30', NULL, NULL, 'https://www.modo.com.ar/promos/transporte-master-agos26', 'LA MEJOR DE LA SEMANA. Solo Mastercard y solo con NFC (poner MODO como billetera contactless favorita). Tope por TARJETA: con dos Mastercard son dos topes. Acumulable con otras promos.'),
('<TU_USER_ID>', '40% en bares', 'Bares adheridos', 'gastronomia', 'modo', 'reintegro', 40, 8000, 'usuario/mes', '{1,2,3,4,5}', 'MODO', 'presencial', '2024-08-01', '2026-09-30', NULL, 'amenity=restaurant', 'https://www.modo.com.ar/promos/40off-bares-galicia-ago24', 'EXCLUSIVA GALICIA. El % más alto del relevamiento. Comercios adheridos: son imágenes en la ficha, verificar el listado en la app de MODO.'),
('<TU_USER_ID>', '40% en desayunos', 'Cafeterías adheridas', 'gastronomia', 'modo', 'reintegro', 40, 8000, 'usuario/mes', '{}', 'MODO', 'presencial', '2025-01-01', '2026-09-30', NULL, 'amenity=restaurant', 'https://www.modo.com.ar/promos/40off-desayunos-galicia-ene25', 'EXCLUSIVA GALICIA, todos los días. Comercios adheridos: verificar en la app de MODO.'),
('<TU_USER_ID>', '25% en Casa del Audio', 'Casa del Audio', 'hogar', 'modo', 'reintegro', 25, 30000, 'usuario/mes', '{5,6,0}', 'MODO', 'presencial', '2026-08-28', '2026-10-18', ARRAY['Casa del Audio'], 'shop=electronics', 'https://www.modo.com.ar/promos/casa-del-audio-agos-2608', 'Fin de semana. Tope alto: la mejor de electro presencial.'),
('<TU_USER_ID>', '20% en Samsung Watch 9 y Watch Ultra', 'Samsung', 'hogar', 'modo', 'reintegro', 20, 80000, 'usuario/promo', '{}', 'MODO', 'online', '2026-08-27', '2026-09-13', ARRAY['Samsung'], 'shop=electronics', 'https://www.modo.com.ar/promos/lanzamiento-watch-9-y-watch-ultra-2608', 'Solo esos dos productos. Tope por promo (una sola vez). Vence el 13/09.'),
('<TU_USER_ID>', '15% en WICO Combustibles', 'WICO', 'combustible', 'modo', 'reintegro', 15, NULL, NULL, '{4}', 'MODO', 'presencial', '2026-05-14', '2026-11-13', ARRAY['WICO'], 'amenity=fuel', 'https://www.modo.com.ar/promos/wico-may26', 'Sin tope. Galicia figura entre los bancos adheridos, PERO la cobertura de estaciones en CABA/GBA está SIN CONFIRMAR: chequear en el mapa de MODO antes de contar con ella.'),
('<TU_USER_ID>', '20% en combustible con Mastercard Galicia', 'Estaciones adheridas', 'combustible', 'galicia', 'descuento', 20, NULL, NULL, '{4}', 'Mastercard Galicia', 'presencial', NULL, '2026-09-10', NULL, 'amenity=fuel', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR, verificar en la app de Galicia. 25% si es Éminent. Solo Mastercard/PowerCard, QR o NFC. VENCE EL 10/09: queda un solo jueves.'),
('<TU_USER_ID>', '50% en colectivo con Mastercard Galicia', 'Transporte público', 'otros', 'galicia', 'descuento', 50, NULL, NULL, '{}', 'Mastercard Galicia', 'presencial', NULL, '2026-09-30', NULL, NULL, 'https://beneficios.galicia.ar/', 'Es la misma promo que la de transporte NFC de MODO vista del lado de Galicia. Tope sin confirmar acá; en la ficha de MODO figura $15.000 por tarjeta por mes.'),
('<TU_USER_ID>', '20% en Rappi', 'Rappi', 'gastronomia', 'galicia', 'descuento', 20, NULL, NULL, '{6}', 'Visa Galicia crédito', 'online', NULL, '2026-09-30', ARRAY['Rappi'], NULL, 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. 25% si es Éminent. Solo tarjeta de crédito Visa.'),
('<TU_USER_ID>', '20% en McDonald''s', 'McDonald''s', 'gastronomia', 'galicia', 'descuento', 20, NULL, NULL, '{0}', 'Visa Galicia / débito Galicia', 'presencial', NULL, '2026-09-27', ARRAY['McDonalds','McDonald''s'], 'amenity=restaurant', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. 25% si es Éminent. Pago con NFC.'),
('<TU_USER_ID>', '20% en Starbucks', 'Starbucks', 'gastronomia', 'galicia', 'descuento', 20, NULL, NULL, '{}', 'Visa Galicia', 'presencial', NULL, '2026-12-31', ARRAY['Starbucks'], 'amenity=restaurant', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. Todos los días, pago con NFC. Vigente hasta fin de año.'),
('<TU_USER_ID>', '20% en Freddo', 'Freddo', 'gastronomia', 'galicia', 'descuento', 20, NULL, NULL, '{}', 'Visa Galicia / débito Galicia', 'presencial', NULL, '2026-09-30', ARRAY['Freddo'], 'amenity=restaurant', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. 25% si es Éminent.'),
('<TU_USER_ID>', '20% en Uber', 'Uber', 'otros', 'galicia', 'descuento', 20, NULL, NULL, '{3}', 'Visa/Mastercard Galicia', 'online', NULL, '2026-09-30', ARRAY['Uber'], NULL, 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. Sube a 30% pagando con Amex Galicia (35% Éminent).'),
('<TU_USER_ID>', '20% en Cabify', 'Cabify', 'otros', 'galicia', 'descuento', 20, NULL, NULL, '{0}', 'Visa/Mastercard Galicia', 'online', NULL, '2026-09-30', ARRAY['Cabify'], NULL, 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. 30% con Amex Galicia (35% Éminent).'),
('<TU_USER_ID>', '20% en Taxi Premium', 'Taxi Premium', 'otros', 'galicia', 'descuento', 20, NULL, NULL, '{1,2}', 'Visa/Mastercard Galicia', 'online', NULL, '2026-09-30', ARRAY['Taxi Premium'], NULL, 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. 30% con Amex Galicia (35% Éminent).'),
('<TU_USER_ID>', '25% en Farmacity.com', 'Farmacity', 'salud', 'galicia', 'descuento', 25, NULL, NULL, '{4}', 'Visa Galicia / débito Galicia', 'online', NULL, '2026-10-31', ARRAY['Farmacity'], 'amenity=pharmacy', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. Es la contracara de la promo exclusiva Galicia de MODO (tope $15.000 por usuario por mes allá).'),
('<TU_USER_ID>', '15% en Farmacity presencial', 'Farmacity', 'salud', 'galicia', 'descuento', 15, NULL, NULL, '{4}', 'Débito Galicia', 'presencial', NULL, '2026-09-30', ARRAY['Farmacity'], 'amenity=pharmacy', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. SOLO tarjeta de débito Galicia: no aplica con crédito.'),
('<TU_USER_ID>', '25% en Farma Plus online', 'FarmaPlus', 'salud', 'galicia', 'descuento', 25, NULL, NULL, '{4}', 'Visa/Mastercard/Amex Galicia', 'online', NULL, '2026-12-31', ARRAY['FarmaPlus','Farma Plus'], 'amenity=pharmacy', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. Mejor que el 15% de MODO y con vigencia hasta fin de año.'),
('<TU_USER_ID>', '10% y 3 cuotas en Farmaonline', 'Farmaonline', 'salud', 'galicia', 'descuento', 10, NULL, NULL, '{4}', 'Visa/Mastercard/Amex Galicia', 'online', NULL, '2026-10-31', ARRAY['Farmaonline'], 'amenity=pharmacy', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. Incluye hasta 3 cuotas sin interés.'),
('<TU_USER_ID>', '15% y 3 cuotas en farmacias de barrio', 'Red de farmacias Galicia', 'salud', 'galicia', 'descuento', 15, NULL, NULL, '{4}', 'Visa/Mastercard Galicia', 'presencial', NULL, '2026-10-31', ARRAY['Openfarma','Del Puente','Farmacia Chester','Farmacia Selma','Farmacia Berlari','Farmacia Aloe','Farmacia Scienza','Farmashop','Go Farma','Federada Farmacia'], 'amenity=pharmacy', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. El listado de marcas es PARCIAL: son decenas de farmacias independientes, verificar en la app de Galicia. Incluye hasta 3 cuotas sin interés.'),
('<TU_USER_ID>', '20% en MasOnline', 'MasOnline', 'supermercado', 'galicia', 'descuento', 20, NULL, NULL, '{1}', 'Visa/Mastercard Galicia', 'online', NULL, '2026-09-30', ARRAY['MasOnline','ChangoMas'], 'shop=supermarket', 'https://beneficios.galicia.ar/', 'Tope SIN CONFIRMAR. Es el e-commerce de ChangoMás; se combina con la promo presencial de los lunes.'),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Frávega', 'Frávega', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'ambos', NULL, '2026-09-30', ARRAY['Fravega','Frávega'], 'shop=electronics', 'https://beneficios.galicia.ar/', 'Hay dos campañas superpuestas, una corta el 14/09 y otra sigue: verificar la vigencia real en la app. 18 CSI solo con Mastercard y exclusivo Éminent.'),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Musimundo', 'Musimundo', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'ambos', NULL, '2026-11-30', ARRAY['Musimundo'], 'shop=electronics', 'https://beneficios.galicia.ar/', 'Vigencia larga, sirve para planificar una compra grande.'),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en On City', 'On City', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'ambos', NULL, '2026-11-30', ARRAY['On City','OnCity'], 'shop=electronics', 'https://beneficios.galicia.ar/', 'Dos campañas (30/09 y 30/11). 18 CSI exclusivo Éminent con Mastercard.'),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Cetrogar', 'Cetrogar', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'ambos', NULL, '2026-11-30', ARRAY['Cetrogar'], 'shop=electronics', 'https://beneficios.galicia.ar/', NULL),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Casa del Audio', 'Casa del Audio', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'ambos', NULL, '2026-11-30', ARRAY['Casa del Audio'], 'shop=electronics', 'https://beneficios.galicia.ar/', 'Se puede combinar mentalmente con el 25% de reintegro de MODO del finde, pero son promos distintas: confirmar si acumulan antes de contar con las dos.'),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Samsung', 'Samsung', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'online', NULL, '2026-11-30', ARRAY['Samsung'], 'shop=electronics', 'https://beneficios.galicia.ar/', 'Incluye Samsung Línea Hogar. 18 CSI exclusivo Éminent con Mastercard.'),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en LG', 'MY LG', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'online', NULL, '2026-11-30', ARRAY['LG','MY LG'], 'shop=electronics', 'https://beneficios.galicia.ar/', NULL),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Motorola', 'Motorola', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'online', NULL, '2026-11-30', ARRAY['Motorola'], 'shop=electronics', 'https://beneficios.galicia.ar/', NULL),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Sony', 'Sony Argentina', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'online', NULL, '2026-11-30', ARRAY['Sony'], 'shop=electronics', 'https://beneficios.galicia.ar/', NULL),
('<TU_USER_ID>', 'Hasta 12 cuotas sin interés en Whirlpool', 'Whirlpool', 'hogar', 'galicia', 'cuotas', 12, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'online', NULL, '2026-11-30', ARRAY['Whirlpool'], 'shop=electronics', 'https://beneficios.galicia.ar/', NULL),
('<TU_USER_ID>', 'Hasta 6 cuotas sin interés en Sodimac', 'Sodimac', 'hogar', 'galicia', 'cuotas', 6, NULL, NULL, '{}', 'Visa/Mastercard/Amex Galicia', 'ambos', NULL, '2026-09-30', ARRAY['Sodimac'], NULL, 'https://beneficios.galicia.ar/', 'Única de hogar/construcción confirmada esta semana.')
on conflict (user_id, titulo) do update set
  comercio       = excluded.comercio,
  rubro          = excluded.rubro,
  emisor         = excluded.emisor,
  tipo           = excluded.tipo,
  valor          = excluded.valor,
  tope           = excluded.tope,
  tope_periodo   = excluded.tope_periodo,
  dias           = excluded.dias,
  medio_pago     = excluded.medio_pago,
  canal          = excluded.canal,
  vigencia_desde = excluded.vigencia_desde,
  vigencia_hasta = excluded.vigencia_hasta,
  marcas         = excluded.marcas,
  osm_filtro     = excluded.osm_filtro,
  url            = excluded.url,
  notas          = excluded.notas,
  -- Vuelve a encenderse si había caído en un relevamiento anterior.
  activa         = true;
  -- `recordar` y `favorita` NO se tocan: son de la persona, no del scraper.

-- Lo que salió del relevamiento se apaga, no se borra: si se borrara, los
-- usos que ya tenga anotados quedarían apuntando a nada.
--
-- El filtro es por dominio y no por "tiene url", porque una promo cargada a
-- mano desde la app también puede tener el link pegado, y apagarle la promo
-- que uno mismo anotó es exactamente lo que no tiene que pasar.
update public.promos p
   set activa = false
  from _corte c
 where p.user_id = '<TU_USER_ID>'
   and (p.url like 'https://www.modo.com.ar/%'
     or p.url like 'https://beneficios.galicia.ar/%')
   and p.updated_at < c.t
   and p.activa;

drop table _corte;

commit;

-- Cuáles avisan el día que aplican. Tenerlo prendido en cuarenta es no tener
-- aviso, así que solo las que se usan de verdad. Ajustar la lista.
-- update public.promos set recordar = true
--  where user_id = '<TU_USER_ID>'
--    and titulo in ('20% en COTO', '50% en transporte con Mastercard',
--                   '40% en bares', '40% en desayunos');
