-- =====================================================================
-- 0004 · Operaciones y dividendos
-- Importes en numeric(20,8); cantidades en numeric(28,10).
-- Cada fila guarda el snapshot de cambio a EUR para que el histórico
-- no cambie si mañana varía el mercado.
-- =====================================================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.users (id) on delete cascade,
  account_id uuid not null,
  asset_id uuid not null,

  type public.transaction_type not null,
  trade_date date not null
    check (trade_date >= date '1900-01-01'),
  quantity numeric(28,10) not null
    check (quantity > 0),
  unit_price numeric(20,8) not null
    check (unit_price >= 0),
  fees numeric(20,8) not null default 0
    check (fees >= 0),
  currency public.currency_code not null,

  -- EUR por 1 unidad de `currency` en fx_rate_date. Para EUR vale 1.
  fx_rate_eur numeric(20,10) not null
    check (fx_rate_eur > 0),
  fx_rate_date date not null,
  fx_rate_source public.fx_rate_source not null default 'AUTO',

  notes text null
    check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Claves compuestas: impiden que una operación mezcle el user_id de un
  -- usuario con la cuenta o el activo de otro, incluso con service_role.
  constraint transactions_account_fk
    foreign key (account_id, user_id)
    references public.accounts (id, user_id)
    on delete cascade,
  constraint transactions_asset_fk
    foreign key (asset_id, user_id)
    references public.assets (id, user_id)
    -- No action diferido: impide borrar un activo con operaciones, pero
    -- permite que el borrado en cascada de un usuario elimine antes sus
    -- operaciones y no choque con la restricción.
    on delete no action
    deferrable initially deferred,

  constraint transactions_fx_date_check
    check (fx_rate_date <= trade_date)
);

comment on table public.transactions is
  'Compras y ventas. La plusvalía realizada no se almacena: se calcula en la API.';
comment on column public.transactions.fx_rate_eur is
  'Snapshot: EUR por 1 unidad de currency. Evita recalcular con tipos futuros.';
comment on column public.transactions.fees is
  'Comisión en la misma divisa que unit_price. Se convierte con fx_rate_eur.';

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create table if not exists public.dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.users (id) on delete cascade,
  account_id uuid not null,
  asset_id uuid not null,

  payment_date date not null
    check (payment_date >= date '1900-01-01'),
  gross_amount numeric(20,8) not null
    check (gross_amount > 0),
  withholding_tax numeric(20,8) not null default 0
    check (withholding_tax >= 0),
  currency public.currency_code not null,

  fx_rate_eur numeric(20,10) not null
    check (fx_rate_eur > 0),
  fx_rate_date date not null,
  fx_rate_source public.fx_rate_source not null default 'AUTO',

  notes text null
    check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dividends_account_fk
    foreign key (account_id, user_id)
    references public.accounts (id, user_id)
    on delete cascade,
  constraint dividends_asset_fk
    foreign key (asset_id, user_id)
    references public.assets (id, user_id)
    on delete no action
    deferrable initially deferred,

  constraint dividends_withholding_check
    check (withholding_tax <= gross_amount),
  constraint dividends_fx_date_check
    check (fx_rate_date <= payment_date)
);

comment on table public.dividends is
  'Dividendos cobrados. El neto (bruto - retención) se calcula, no se guarda.';

drop trigger if exists dividends_set_updated_at on public.dividends;
create trigger dividends_set_updated_at
  before update on public.dividends
  for each row execute function public.set_updated_at();
