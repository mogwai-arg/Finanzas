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
  recordar      boolean not null default false, -- que aparezca en Hoy el dia que aplica
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
  avisos       jsonb not null default '{}'::jsonb, -- que avisos llegan al telefono
  saldo_minimo numeric(14,2) not null default 0,
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
  updated_at timestamptz not null default now(),
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
