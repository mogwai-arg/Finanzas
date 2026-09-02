-- =====================================================================
-- BISHUSHA — esquema completo, en orden.
--
-- Es la concatenacion de schema.sql y las migraciones 003 a 006. Se pega
-- entero en Supabase > SQL Editor > New query > Run, una sola vez.
-- Todo es idempotente: correrlo dos veces no rompe nada.
-- =====================================================================

-- =====================================================================
-- Control de Finanzas y Beneficios  |  esquema Supabase (Postgres)
-- Ejecutar entero en Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- CUENTAS / TARJETAS / BILLETERAS
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  nombre          text not null,
  tipo            text not null check (tipo in ('credito','debito','cuenta','billetera','efectivo')),
  banco           text,
  marca           text,                       -- visa / mastercard / amex / -
  ultimos4        text,
  moneda          text not null default 'ARS' check (moneda in ('ARS','USD')),
  cierre_dia      int check (cierre_dia between 1 and 31),      -- solo credito
  vencimiento_dia int check (vencimiento_dia between 1 and 31), -- solo credito
  limite          numeric(14,2),
  color           text default '#2f6fed',
  orden           int default 0,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CATEGORIAS
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  nombre     text not null,
  tipo       text not null default 'gasto' check (tipo in ('gasto','ingreso')),
  color      text default '#8a8f98',
  presupuesto numeric(14,2),          -- tope mensual sugerido en ARS
  orden      int default 0,
  created_at timestamptz not null default now(),
  unique (user_id, nombre, tipo)
);

-- ---------------------------------------------------------------------
-- MOVIMIENTOS
-- Una compra en cuotas se guarda como UNA fila con monto total + cuotas.
-- El cronograma de cuotas lo calcula la app a partir del cierre de la tarjeta.
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  fecha        date not null,
  descripcion  text not null,
  comercio     text,
  monto        numeric(14,2) not null check (monto >= 0),  -- monto TOTAL de la compra
  moneda       text not null default 'ARS' check (moneda in ('ARS','USD')),
  tipo         text not null default 'gasto' check (tipo in ('gasto','ingreso')),
  account_id   uuid references public.accounts(id) on delete set null,
  category_id  uuid references public.categories(id) on delete set null,
  cuotas       int not null default 1 check (cuotas between 1 and 60),
  reintegro    numeric(14,2) default 0,        -- reintegro esperado/acreditado
  promo_id     uuid,
  notas        text,
  origen       text default 'manual' check (origen in ('manual','import')),
  import_hash  text,                            -- dedupe al importar resumen
  created_at   timestamptz not null default now()
);
create index if not exists tx_user_fecha_idx on public.transactions (user_id, fecha desc);
create unique index if not exists tx_import_hash_idx on public.transactions (user_id, import_hash) where import_hash is not null;

-- ---------------------------------------------------------------------
-- GASTOS RECURRENTES (colegio, luz, gas, alquiler, suscripciones...)
-- ---------------------------------------------------------------------
create table if not exists public.recurrings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nombre        text not null,
  monto_estimado numeric(14,2) not null default 0,
  moneda        text not null default 'ARS' check (moneda in ('ARS','USD')),
  dia_vencimiento int not null default 10 check (dia_vencimiento between 1 and 31),
  category_id   uuid references public.categories(id) on delete set null,
  account_id    uuid references public.accounts(id) on delete set null,
  variable      boolean not null default false,  -- true = el monto cambia todos los meses
  activo        boolean not null default true,
  orden         int default 0,
  created_at    timestamptz not null default now()
);

-- Un registro por recurrente y por mes: marca si ya se pago y con cuanto.
create table if not exists public.recurring_payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  recurring_id  uuid not null references public.recurrings(id) on delete cascade,
  periodo       text not null,                  -- 'YYYY-MM'
  monto         numeric(14,2),
  pagado_at     timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (recurring_id, periodo)
);

-- ---------------------------------------------------------------------
-- PRESUPUESTOS POR MES
-- ---------------------------------------------------------------------
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  periodo     text not null,                    -- 'YYYY-MM'
  category_id uuid references public.categories(id) on delete cascade,
  monto       numeric(14,2) not null default 0,
  moneda      text not null default 'ARS' check (moneda in ('ARS','USD')),
  unique (user_id, periodo, category_id)
);

-- ---------------------------------------------------------------------
-- PROMOS (curadas, actualizables)
-- ---------------------------------------------------------------------
create table if not exists public.promos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  titulo        text not null,
  comercio      text,
  rubro         text not null default 'otros',  -- supermercado / combustible / gastronomia / indumentaria / hogar / otros
  emisor        text not null default 'galicia',-- galicia / modo / mercadopago / otro
  tipo          text not null default 'reintegro' check (tipo in ('reintegro','descuento','cuotas')),
  valor         numeric(6,2),                   -- 20 = 20% / o cantidad de cuotas
  tope          numeric(14,2),                  -- tope de reintegro por periodo
  tope_periodo  text default 'mensual',         -- semanal / mensual / por compra
  dias          int[] default '{}',             -- 0=domingo ... 6=sabado ; vacio = todos
  medio_pago    text,                           -- 'Tarjeta Galicia Visa', 'MODO', ...
  canal         text default 'ambos' check (canal in ('presencial','online','ambos')),
  vigencia_desde date,
  vigencia_hasta date,
  url           text,
  notas         text,
  activa        boolean not null default true,
  favorita      boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index if not exists promos_user_idx on public.promos (user_id, activa);

-- ---------------------------------------------------------------------
-- COTIZACION USD (para mostrar referencia, no convierte automaticamente)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  usd_ref      numeric(14,2) default 0,
  sueldo_dia   int default 1,
  alert_pct    int default 80,                  -- % de presupuesto que dispara alerta
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY: cada usuario ve solo lo suyo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','recurrings',
                           'recurring_payments','budgets','promos','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_all" on public.%I', t);
    execute format($f$create policy "own_all" on public.%I
                      for all using (user_id = auth.uid())
                      with check (user_id = auth.uid())$f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- SEED automatico al crear usuario: categorias base
-- ---------------------------------------------------------------------
create or replace function public.seed_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  insert into public.categories (user_id, nombre, tipo, color, orden) values
    (new.id,'Supermercado','gasto','#2fa96b',1),
    (new.id,'Servicios','gasto','#e0a83b',2),
    (new.id,'Colegio / Educacion','gasto','#7a5cf0',3),
    (new.id,'Combustible / Transporte','gasto','#2f6fed',4),
    (new.id,'Gastronomia','gasto','#e0603b',5),
    (new.id,'Salud','gasto','#3bb6e0',6),
    (new.id,'Hogar','gasto','#9a6b4f',7),
    (new.id,'Entretenimiento','gasto','#d13b8a',8),
    (new.id,'Indumentaria','gasto','#5f7a8a',9),
    (new.id,'Otros','gasto','#8a8f98',10),
    (new.id,'Sueldo','ingreso','#2fa96b',1),
    (new.id,'Extras','ingreso','#3bb6e0',2)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_nuevo_usuario();

-- =====================================================================
-- PARTE 2 — automatizacion: ingesta por mail/API, geolocalizacion, avisos
-- =====================================================================

-- Trazabilidad de cada movimiento: de donde salio y si ya lo revisaste.
alter table public.transactions add column if not exists fuente text not null default 'manual';
alter table public.transactions add column if not exists revisado boolean not null default true;
alter table public.transactions add column if not exists confianza int not null default 100;
alter table public.transactions add column if not exists externo_id text;
create unique index if not exists tx_externo_idx on public.transactions (user_id, fuente, externo_id)
  where externo_id is not null;
create index if not exists tx_revisado_idx on public.transactions (user_id, revisado) where revisado = false;

-- Promos: como encontrarlas en el mapa.
alter table public.promos add column if not exists marcas text[] default '{}';      -- nombres/brands en OpenStreetMap
alter table public.promos add column if not exists osm_filtro text;                 -- ej: 'amenity=pharmacy'
alter table public.promos add column if not exists solo_cercania boolean default false;

-- Sucursales fijadas a mano (cuando OSM no alcanza).
create table if not exists public.promo_sucursales (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  promo_id  uuid not null references public.promos(id) on delete cascade,
  nombre    text,
  direccion text,
  lat       double precision not null,
  lng       double precision not null
);

-- Cuentas conectadas (Gmail, Mercado Pago). Los tokens quedan solo aca,
-- protegidos por RLS: nadie mas que el dueño los puede leer.
create table if not exists public.integrations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  proveedor     text not null check (proveedor in ('gmail','mercadopago')),
  cuenta        text,
  access_token  text,
  refresh_token text,
  expira_at     timestamptz,
  cursor        text,                          -- historyId de Gmail / offset de MP
  activo        boolean not null default true,
  ultima_sync   timestamptz,
  ultimo_error  text,
  created_at    timestamptz not null default now(),
  unique (user_id, proveedor)
);

-- Todo mail o evento procesado, para auditar y no duplicar.
create table if not exists public.ingest_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  fuente        text not null,
  externo_id    text,
  remitente     text,
  asunto        text,
  recibido_at   timestamptz,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','cargado','ignorado','error','duplicado')),
  detalle       text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (user_id, fuente, externo_id)
);

-- Avisos que ve la app (y que se mandan por push).
create table if not exists public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tipo       text not null default 'info',   -- carga_auto / vencimiento / presupuesto / promo
  titulo     text not null,
  cuerpo     text,
  ref_tabla  text,
  ref_id     uuid,
  leida      boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_idx on public.notificaciones (user_id, leida, created_at desc);

-- Suscripciones Web Push del navegador/celular.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

-- Reglas para categorizar solo: si el comercio matchea, va a esta categoria.
create table if not exists public.reglas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  patron      text not null,                  -- texto o regex simple sobre el comercio
  category_id uuid references public.categories(id) on delete cascade,
  account_id  uuid references public.accounts(id) on delete set null,
  prioridad   int default 0,
  veces_usada int default 0
);

-- RLS para las tablas nuevas
do $$
declare t text;
begin
  foreach t in array array['promo_sucursales','integrations','ingest_log',
                           'notificaciones','push_subscriptions','reglas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_all" on public.%I', t);
    execute format($f$create policy "own_all" on public.%I
                      for all using (user_id = auth.uid())
                      with check (user_id = auth.uid())$f$, t);
  end loop;
end $$;
-- =====================================================================
-- PARTE 3 — el sueldo se aprende, no se carga
--
-- En Argentina el sueldo cambia todos los meses. Un ingreso fijo escrito a
-- mano queda viejo en treinta dias. Esta tabla guarda los recibos y el
-- modulo js/sueldo.js deduce de ahi el ritmo de la paritaria, la proyeccion
-- de los proximos meses y el aguinaldo.
-- =====================================================================

create table if not exists public.recibos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  periodo         text not null,                    -- 'YYYY-MM' al que corresponde
  concepto        text not null default 'mensual'
                  check (concepto in ('mensual','aguinaldo','extra')),

  -- El basico del convenio. Es el unico numero que sigue a la paritaria de
  -- forma limpia: el neto se ensucia con vacaciones, aguinaldo y dias no
  -- trabajados. Proyectar desde aca y no desde el neto.
  basico          numeric(14,2),

  -- Los tres numeros que definen el recibo. Se separan porque los aportes
  -- NO se calculan igual sobre cada uno:
  --   17 %  (jubilacion 11 + ley 19032 3 + obra social 3) sobre remunerativo
  --   2,5 % (sindicato 2 + FAECYS 0,5)                    sobre el total
  remunerativo    numeric(14,2) not null default 0,
  no_remunerativo numeric(14,2) not null default 0,
  deducciones     numeric(14,2) not null default 0,
  neto            numeric(14,2) not null default 0,

  pagado_el       date,          -- la fecha que imprime el recibo
  acreditado_el   date,          -- cuando entro de verdad al banco
  sobre           numeric(14,2) default 0,   -- parte cobrada en efectivo

  -- Un mes con vacaciones o retroactivo no sirve para aprender la relacion
  -- entre el basico y el bruto: la infla. Se marca y se excluye del promedio.
  atipico         boolean,
  conceptos       text[] default '{}',       -- los renglones tal cual figuran

  estimado        boolean not null default false,  -- true = proyectado, no cobrado
  notas           text,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (user_id, periodo, concepto)
);
create index if not exists recibos_idx on public.recibos (user_id, periodo desc);

-- Parametros del sueldo que no salen del recibo.
alter table public.settings add column if not exists sumas_fijas_nr numeric(14,2) default 0;
alter table public.settings add column if not exists dia_cobro       int default 1;
alter table public.settings add column if not exists sobre_estimado  numeric(14,2) default 0;
alter table public.settings add column if not exists ritmo_paritaria numeric(6,4);

-- updated_at automatico. Es la condicion para sincronizar por diferencia en
-- vez de bajarse las tablas enteras en cada arranque.
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['recibos','transactions','accounts','categories',
                           'recurrings','budgets','promos','reglas']
  loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists tocar_%I on public.%I', t, t);
    execute format('create trigger tocar_%I before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
  end loop;
end $$;

-- RLS
alter table public.recibos enable row level security;
drop policy if exists "own_all" on public.recibos;
create policy "own_all" on public.recibos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- =====================================================================
-- PARTE 4 — transferencias entre cuentas propias
--
-- El extracto del 01/09 muestra $ 823.133 saliendo de la cuenta, pero solo
-- $ 84.453 son gasto: $ 715.580 son transferencias a billeteras propias y
-- $ 23.100 una compra de dolares. Esa plata no se gasto, cambio de lugar.
--
-- Sin este tipo de movimiento la app infla el gasto del dia diez veces, y
-- despues lo cuenta OTRA VEZ cuando esa misma plata se gasta desde la
-- billetera. Es el error clasico de las apps de gastos.
-- =====================================================================

alter table public.transactions drop constraint if exists transactions_tipo_check;
alter table public.transactions add constraint transactions_tipo_check
  check (tipo in ('gasto','ingreso','transferencia'));

-- A donde va la plata. Solo para tipo = 'transferencia'.
alter table public.transactions add column if not exists destino_account_id uuid
  references public.accounts(id) on delete set null;

-- Cuando la transferencia cambia de moneda —comprar dolares es transferir de
-- una cuenta en pesos a una en dolares— el destino recibe otro importe. De la
-- relacion entre los dos sale el tipo de cambio real de la operacion, sin
-- tener que preguntarlo ni buscar la cotizacion del dia.
alter table public.transactions add column if not exists monto_destino  numeric(14,2);
alter table public.transactions add column if not exists moneda_destino text
  check (moneda_destino is null or moneda_destino in ('ARS','USD'));

-- Una transferencia necesita destino; un gasto o un ingreso no lo admiten.
alter table public.transactions drop constraint if exists transferencia_coherente;
alter table public.transactions add constraint transferencia_coherente check (
  (tipo = 'transferencia' and destino_account_id is not null
                          and destino_account_id <> account_id)
  or (tipo <> 'transferencia' and destino_account_id is null)
);

create index if not exists tx_destino_idx on public.transactions (user_id, destino_account_id)
  where destino_account_id is not null;

-- Saldo de arranque de cada cuenta, para no tener que cargar la historia entera.
alter table public.accounts add column if not exists saldo_inicial numeric(14,2) default 0;
alter table public.accounts add column if not exists saldo_al date;
-- =====================================================================
-- PARTE 5 — paritarias y sumas no remunerativas, cargables desde la app
--
-- Hasta ahora el acuerdo vivia en el codigo. En Argentina se firma uno cada
-- tres o cuatro meses, asi que tiene que poder cargarse sin tocar la app.
-- =====================================================================

create table if not exists public.paritarias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  nombre      text not null,                 -- 'Acuerdo julio 2026'
  convenio    text,                          -- 'CCT 130/75'

  -- Un acuerdo argentino casi nunca es "X % por mes". Suele ser "X % en
  -- julio, agosto y septiembre, NO acumulativo, sobre la base de junio".
  -- La diferencia no es teorica: no acumulativo, el salto mensual BAJA.
  base        text not null,                 -- 'YYYY-MM' del sueldo base
  acumulativo boolean not null default false,
  tramos      jsonb not null default '[]',   -- [{ "periodo": "2026-07", "pct": 1.9 }, ...]

  -- Cuando se termina el acuerdo hay revision: lo que venga despues es una
  -- suposicion, no un dato, y la app tiene que poder decirlo.
  revision_en text,                          -- 'YYYY-MM'

  url         text,                          -- de donde salio, para poder verificarlo
  notas       text,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists paritarias_idx on public.paritarias (user_id, base desc);

-- Sumas fijas no remunerativas, con vigencia.
-- El bono del acuerdo de julio 2026 se pago SOLO en julio y agosto: sin
-- declarar el `hasta`, la proyeccion lo sigue sumando para siempre.
create table if not exists public.sumas_nr (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  concepto   text not null,
  monto      numeric(14,2) not null default 0,
  desde      text,                           -- 'YYYY-MM' inclusive; null = siempre
  hasta      text,                           -- 'YYYY-MM' inclusive; null = sin fin
  paritaria_id uuid references public.paritarias(id) on delete set null,
  activo     boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists sumas_nr_idx on public.sumas_nr (user_id, desde);

-- updated_at automatico, igual que el resto
do $$
declare t text;
begin
  foreach t in array array['paritarias','sumas_nr']
  loop
    execute format('drop trigger if exists tocar_%I on public.%I', t, t);
    execute format('create trigger tocar_%I before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_all" on public.%I', t);
    execute format($f$create policy "own_all" on public.%I
                      for all using (user_id = auth.uid())
                      with check (user_id = auth.uid())$f$, t);
  end loop;
end $$;
-- =====================================================================
-- PARTE 6 — lo que la app usa y todavia no existia en la base
--
-- Salio de auditar el codigo contra el esquema antes del primer deploy.
-- Sin esto, la pantalla de promos y el calculo de ciclos fallan en silencio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- TOPE DE REINTEGRO CONSUMIDO
-- Una promo de "25 % de reintegro, hasta $20.000 por mes" deja de ser del
-- 25 % apenas se usa. Sin llevar la cuenta, la app miente: dice 25 % cuando
-- ya solo quedan $ 7.600. Es el dato que ningun banco muestra.
-- ---------------------------------------------------------------------
create table if not exists public.promo_usos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  promo_id   uuid not null references public.promos(id) on delete cascade,
  periodo    text not null,                     -- 'YYYY-MM'
  usado      numeric(14,2) not null default 0,  -- reintegro ya consumido
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (promo_id, periodo)
);
create index if not exists promo_usos_idx on public.promo_usos (user_id, periodo);

-- ---------------------------------------------------------------------
-- CICLOS DECLARADOS DE LA TARJETA
-- En Galicia el cierre NO cae un dia fijo del mes: en el resumen de agosto
-- de 2026 los cierres son 30-jul, 27-ago y 1-oct — todos jueves, con el
-- vencimiento ocho dias despues, pero separados 28 y 35 dias. Con un
-- `cierre_dia` fijo la cuenta da mal casi todos los meses.
--
-- Cada resumen publica seis fechas, incluido el ciclo QUE VIENE. Guardarlas
-- es mas barato y mas exacto que adivinar la regla.
--   [{ "cierre": "2026-08-27", "vence": "2026-09-04" }, ...]
-- ---------------------------------------------------------------------
alter table public.accounts add column if not exists ciclos jsonb not null default '[]';

-- Trigger de updated_at, igual que el resto de las tablas.
do $$
begin
  execute 'drop trigger if exists tocar_promo_usos on public.promo_usos';
  execute 'create trigger tocar_promo_usos before update on public.promo_usos
           for each row execute function public.tocar_updated_at()';
end $$;

alter table public.promo_usos enable row level security;
drop policy if exists "own_all" on public.promo_usos;
create policy "own_all" on public.promo_usos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 007 — el permiso a medio hacer
--
-- POR QUE: `state` viajaba con el JWT del usuario adentro, unos 900
-- caracteres. Google acepta la direccion pero no muestra la pantalla de
-- permisos: rebota al instante, como si el usuario hubiera cancelado. Abrir
-- la misma direccion a mano, sin JWT, funcionaba; por la app no.
--
-- Ademas de romper, mandar la sesion dentro de una URL que pasa por los
-- servidores de un tercero y queda en el historial del navegador es mala
-- idea. Ahora viaja un numero al azar y de un solo uso, y de quien es la
-- sesion se resuelve aca.
-- ---------------------------------------------------------------------
create table if not exists public.oauth_pendientes (
  nonce      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  proveedor  text not null,
  created_at timestamptz not null default now()
);

-- Sin policies a proposito: solo la service role de las funciones entra.
-- El navegador no tiene nada que hacer con esta tabla.
alter table public.oauth_pendientes enable row level security;

create index if not exists oauth_pendientes_creado_idx
  on public.oauth_pendientes (created_at);
