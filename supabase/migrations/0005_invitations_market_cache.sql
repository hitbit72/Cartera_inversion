-- =====================================================================
-- 0005 · Invitaciones y cachés globales de mercado
-- Invitaciones: registro solo por invitación (decisión del usuario).
-- market_prices / fx_rates: datos públicos compartidos, sin user_id.
-- =====================================================================

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null
    check (
      char_length(email) <= 254
      and email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    ),

  -- Solo se guarda el SHA-256 del token; el token en claro nunca toca la BD.
  token_hash text not null
    check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  created_by uuid null
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint invitations_token_hash_unique unique (token_hash),
  constraint invitations_expiry_check check (expires_at > created_at)
);

comment on table public.invitations is
  'Invitaciones de un solo uso. La gestiona el CLI con service_role; la app no las expone.';
comment on column public.invitations.token_hash is
  'SHA-256 hexadecimal del token enviado en el enlace de registro.';

create table if not exists public.market_prices (
  symbol text not null
    check (symbol ~ '^[A-Z0-9.^=-]{1,20}$'),
  price_date date not null,
  close_price numeric(20,8) not null
    check (close_price > 0),
  currency public.currency_code not null,
  source text not null default 'yahoo'
    check (char_length(source) between 1 and 40),
  fetched_at timestamptz not null default now(),

  primary key (symbol, price_date)
);

comment on table public.market_prices is
  'Caché global de cierres diarios. La escribe el planificador; solo lectura para usuarios.';

create table if not exists public.fx_rates (
  -- Pivote fijo en EUR: rate = 1 EUR expresado en quote_currency.
  base_currency public.currency_code not null default 'EUR'
    check (base_currency = 'EUR'),
  quote_currency public.currency_code not null,
  rate_date date not null,
  rate numeric(20,10) not null
    check (rate > 0),
  source text not null default 'frankfurter'
    check (char_length(source) between 1 and 40),
  fetched_at timestamptz not null default now(),

  primary key (base_currency, quote_currency, rate_date),
  constraint fx_rates_not_same check (base_currency <> quote_currency)
);

comment on table public.fx_rates is
  'Caché global de tipos de cambio. rate = unidades de quote por 1 EUR.';
comment on column public.fx_rates.rate is
  'Para obtener EUR por unidad de quote: 1 / rate.';
