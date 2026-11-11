-- =====================================================================
-- 0003 · Activos
-- Metadatos por usuario: símbolo, tipo, sector, país y moneda.
-- Incluye modo de precio manual para activos sin cobertura en Yahoo.
-- =====================================================================

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.users (id) on delete cascade,

  -- Símbolo canónico del proveedor: AAPL, BTC-USD, IWDA.AS, ^GSPC.
  symbol text not null
    check (symbol ~ '^[A-Z0-9.^=-]{1,20}$'),
  name text not null
    check (char_length(btrim(name)) between 1 and 120),
  asset_type public.asset_type not null,

  -- Texto libre con sugerencias GICS en la interfaz: no todos los activos
  -- encajan en una lista cerrada y el usuario puede clasificarlos.
  sector text null
    check (sector is null or char_length(btrim(sector)) between 1 and 80),
  country public.country_code null,
  currency public.currency_code not null,
  exchange text null
    check (exchange is null or char_length(btrim(exchange)) between 1 and 40),
  isin text null
    check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),

  -- Precio manual: alternativa cuando el proveedor no cubre el activo.
  price_mode public.price_mode not null default 'AUTO',
  manual_price numeric(20,8) null
    check (manual_price is null or manual_price > 0),
  manual_price_currency public.currency_code null,
  manual_price_at timestamptz null,

  notes text null
    check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assets_user_symbol_unique unique (user_id, symbol),
  constraint assets_id_user_unique unique (id, user_id),
  constraint assets_manual_price_required check (
    price_mode = 'AUTO'
    or (
      manual_price is not null
      and manual_price_currency is not null
      and manual_price_at is not null
    )
  )
);

comment on table public.assets is
  'Activos del usuario. No se comparten entre usuarios para permitir clasificación propia.';
comment on column public.assets.currency is
  'Divisa en la que cotiza el activo (no la divisa base del usuario).';
comment on column public.assets.price_mode is
  'AUTO usa el proveedor; MANUAL usa manual_price para la valoración actual.';

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();
