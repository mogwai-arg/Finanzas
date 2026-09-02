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
