-- =====================================================================
-- 0002 · Usuarios y cuenta única
-- public.users es el perfil de la aplicación, ligado 1:1 a auth.users.
-- public.accounts garantiza exactamente una cuenta por usuario.
-- =====================================================================

create table if not exists public.users (
  id uuid primary key
    references auth.users (id) on delete cascade,
  display_name text not null default 'Inversor'
    check (char_length(btrim(display_name)) between 1 and 80),
  base_currency public.currency_code not null default 'EUR',
  cost_method public.cost_method not null default 'FIFO',
  benchmark_symbol text null default 'URTH'
    check (
      benchmark_symbol is null
      or benchmark_symbol ~ '^[A-Z0-9.^=-]{1,20}$'
    ),
  theme public.theme not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is
  'Perfil de aplicación. No duplica el email: se obtiene de auth.users.';
comment on column public.users.cost_method is
  'Método global del usuario: FIFO o coste medio. El cálculo real vive en la API.';
comment on column public.users.base_currency is
  'Moneda de presentación. Los cálculos internos usan EUR como pivote.';

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.users (id) on delete cascade,
  name text not null default 'Mi cartera'
    check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1:1 usuario-cuenta: impide una segunda cuenta para el mismo usuario.
  constraint accounts_user_unique unique (user_id),

  -- Necesario para las claves foráneas compuestas de transactions/dividends.
  constraint accounts_id_user_unique unique (id, user_id)
);

comment on table public.accounts is
  'Una única cuenta por usuario. UNIQUE(user_id) lo garantiza a nivel de BD.';

-- ---------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Alta automática de perfil y cuenta al crear un usuario en auth.users.
-- SECURITY DEFINER permite escribir en public.users/accounts sin que el
-- rol authenticated necesite INSERT; el trigger corre como owner.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, display_name)
  values (
    new.id,
    left(
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Inversor'),
      80
    )
  )
  on conflict (id) do nothing;

  insert into public.accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from PUBLIC, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
