-- =====================================================================
-- 0006 · Índices
-- Cubren listados por fecha, histórico por activo y claves foráneas
-- compuestas. Las claves únicas se crean inline en las tablas.
-- =====================================================================

-- Activos
create index if not exists assets_user_type_idx
  on public.assets (user_id, asset_type);

-- Operaciones
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, trade_date desc, id desc);

create index if not exists transactions_user_asset_date_idx
  on public.transactions (user_id, asset_id, trade_date, id);

create index if not exists transactions_user_type_date_idx
  on public.transactions (user_id, type, trade_date);

-- Índices para las FK compuestas (account_id, user_id) y (asset_id, user_id).
create index if not exists transactions_account_user_idx
  on public.transactions (account_id, user_id);

create index if not exists transactions_asset_user_idx
  on public.transactions (asset_id, user_id);

-- Dividendos
create index if not exists dividends_user_date_idx
  on public.dividends (user_id, payment_date desc, id desc);

create index if not exists dividends_user_asset_date_idx
  on public.dividends (user_id, asset_id, payment_date);

create index if not exists dividends_account_user_idx
  on public.dividends (account_id, user_id);

create index if not exists dividends_asset_user_idx
  on public.dividends (asset_id, user_id);

-- Invitaciones: una pendiente por email y búsqueda rápida de caducadas.
create unique index if not exists invitations_pending_email_idx
  on public.invitations (email)
  where accepted_at is null;

create index if not exists invitations_pending_expiry_idx
  on public.invitations (expires_at)
  where accepted_at is null;

-- Mercado: la PK (symbol, price_date) ya cubre el histórico por símbolo.
create index if not exists market_prices_symbol_fetched_idx
  on public.market_prices (symbol, fetched_at desc);

-- Divisas: la PK (base, quote, date) ya cubre la consulta habitual.
create index if not exists fx_rates_quote_date_idx
  on public.fx_rates (quote_currency, rate_date desc);
