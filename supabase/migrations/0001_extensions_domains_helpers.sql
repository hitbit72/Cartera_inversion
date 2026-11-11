-- =====================================================================
-- 0001 · Extensiones, dominios y funciones auxiliares
-- Ejecutar en el SQL Editor de Supabase, en orden (0001 → 0007).
-- =====================================================================

-- citext: emails de invitación sin distinguir mayúsculas/minúsculas.
-- pgcrypto: disponible por si se necesita hashing/aleatoriedad en el futuro.
create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Dominios: centralizan listas cerradas y evitan repetir CHECK largos.
-- Se usa text en lugar de char(n) para no arrastrar relleno de espacios.
-- ---------------------------------------------------------------------

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'currency_code'
  ) then
    execute $ddl$
      create domain public.currency_code as text
        constraint currency_code_valid
        check (value in (
          'EUR','USD','GBP','CHF','CAD','AUD','JPY',
          'SEK','NOK','DKK','PLN','CZK','HKD','SGD'
        ))
    $ddl$;
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'country_code'
  ) then
    execute $ddl$
      create domain public.country_code as text
        constraint country_code_valid
        check (value ~ '^[A-Z]{2}$')
    $ddl$;
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'cost_method'
  ) then
    execute $ddl$
      create domain public.cost_method as text
        constraint cost_method_valid
        check (value in ('FIFO','AVERAGE'))
    $ddl$;
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'asset_type'
  ) then
    execute $ddl$
      create domain public.asset_type as text
        constraint asset_type_valid
        check (value in ('STOCK','CRYPTO','ETF','FUND','BOND'))
    $ddl$;
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'transaction_type'
  ) then
    execute $ddl$
      create domain public.transaction_type as text
        constraint transaction_type_valid
        check (value in ('BUY','SELL'))
    $ddl$;
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'price_mode'
  ) then
    execute $ddl$
      create domain public.price_mode as text
        constraint price_mode_valid
        check (value in ('AUTO','MANUAL'))
    $ddl$;
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fx_rate_source'
  ) then
    execute $ddl$
      create domain public.fx_rate_source as text
        constraint fx_rate_source_valid
        check (value in ('AUTO','MANUAL'))
    $ddl$;
  end if;
end
$do$;

do $do$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'theme'
  ) then
    execute $ddl$
      create domain public.theme as text
        constraint theme_valid
        check (value in ('light','dark','system'))
    $ddl$;
  end if;
end
$do$;

-- ---------------------------------------------------------------------
-- updated_at automático para las tablas de usuario.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from PUBLIC, anon, authenticated;
