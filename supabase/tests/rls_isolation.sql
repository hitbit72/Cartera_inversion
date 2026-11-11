-- =====================================================================
-- Pruebas de aislamiento RLS
-- Ejecutar DESPUÉS de las migraciones 0001 → 0007, en el SQL Editor.
--
-- ¡Solo para desarrollo! Crea dos usuarios y datos de prueba. El script
-- intenta borrarlos al final, pero no debe ejecutarse en producción.
--
-- Simula la sesión de cada usuario con:
--   SET ROLE authenticated;
--   SET request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- y comprueba lectura, inserción, modificación y borrado cruzados.
--
-- Si el editor devuelve "permission denied to set role authenticated",
-- ejecuta antes:  grant authenticated to postgres;
-- =====================================================================

-- Descomenta si SET ROLE falla en tu proyecto:
-- grant authenticated to postgres;

-- ---------------------------------------------------------------------
-- 0. Limpieza de ejecuciones anteriores
-- ---------------------------------------------------------------------
drop table if exists public._rls_test_results;
drop table if exists public._rls_test_ids;

delete from public.invitations
where email in ('rls-test-1@example.com', 'rls-test-2@example.com');

delete from auth.users
where email in ('rls-test-1@example.com', 'rls-test-2@example.com');

-- ---------------------------------------------------------------------
-- 1. Tabla de resultados (se elimina al final)
-- ---------------------------------------------------------------------
create table public._rls_test_results (
  test text primary key,
  passed boolean not null,
  detail text
);

grant insert, select on public._rls_test_results to authenticated;

-- ---------------------------------------------------------------------
-- 2. Dos usuarios de prueba en auth.users
-- El trigger on_auth_user_created crea su perfil y su cuenta.
-- El hash es un bcrypt de ejemplo; estos usuarios no se usan para login.
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'rls-test-1@example.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Usuario Uno"}'::jsonb,
  now(),
  now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated',
  'authenticated',
  'rls-test-2@example.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Usuario Dos"}'::jsonb,
  now(),
  now()
);

-- ---------------------------------------------------------------------
-- 3. Verificar el trigger de alta
-- ---------------------------------------------------------------------
do $$
declare
  v_profiles int;
  v_accounts int;
begin
  select count(*) into v_profiles
  from public.users
  where id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );

  select count(*) into v_accounts
  from public.accounts
  where user_id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );

  insert into public._rls_test_results (test, passed, detail)
  values ('trigger: 2 perfiles', v_profiles = 2, 'perfiles=' || v_profiles);

  insert into public._rls_test_results (test, passed, detail)
  values ('trigger: 2 cuentas', v_accounts = 2, 'cuentas=' || v_accounts);
end $$;

-- ---------------------------------------------------------------------
-- 4. Datos del usuario 1 (como usuario 1, para probar INSERT propio)
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.assets (user_id, symbol, name, asset_type, sector, country, currency)
values (
  '11111111-1111-1111-1111-111111111111',
  'AAPL', 'Apple Inc.', 'STOCK', 'Tecnología', 'US', 'USD'
);

insert into public.transactions (
  user_id, account_id, asset_id, type, trade_date, quantity,
  unit_price, fees, currency, fx_rate_eur, fx_rate_date, fx_rate_source
)
select
  '11111111-1111-1111-1111-111111111111',
  a.id, s.id, 'BUY', date '2024-01-15', 10,
  150, 1, 'USD', 0.92, date '2024-01-15', 'AUTO'
from public.accounts a
join public.assets s on s.user_id = a.user_id
where a.user_id = '11111111-1111-1111-1111-111111111111'
  and s.symbol = 'AAPL';

insert into public.dividends (
  user_id, account_id, asset_id, payment_date, gross_amount,
  withholding_tax, currency, fx_rate_eur, fx_rate_date, fx_rate_source
)
select
  '11111111-1111-1111-1111-111111111111',
  a.id, s.id, date '2024-03-01', 100,
  15, 'USD', 0.92, date '2024-03-01', 'AUTO'
from public.accounts a
join public.assets s on s.user_id = a.user_id
where a.user_id = '11111111-1111-1111-1111-111111111111'
  and s.symbol = 'AAPL';

commit;

-- ---------------------------------------------------------------------
-- 5. Datos del usuario 2
-- ---------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into public.assets (user_id, symbol, name, asset_type, sector, country, currency)
values (
  '22222222-2222-2222-2222-222222222222',
  'MSFT', 'Microsoft Corp.', 'STOCK', 'Tecnología', 'US', 'USD'
);

insert into public.transactions (
  user_id, account_id, asset_id, type, trade_date, quantity,
  unit_price, fees, currency, fx_rate_eur, fx_rate_date, fx_rate_source
)
select
  '22222222-2222-2222-2222-222222222222',
  a.id, s.id, 'BUY', date '2024-02-01', 5,
  300, 2, 'USD', 0.90, date '2024-02-01', 'AUTO'
from public.accounts a
join public.assets s on s.user_id = a.user_id
where a.user_id = '22222222-2222-2222-2222-222222222222'
  and s.symbol = 'MSFT';

insert into public.dividends (
  user_id, account_id, asset_id, payment_date, gross_amount,
  withholding_tax, currency, fx_rate_eur, fx_rate_date, fx_rate_source
)
select
  '22222222-2222-2222-2222-222222222222',
  a.id, s.id, date '2024-04-01', 50,
  7.5, 'USD', 0.91, date '2024-04-01', 'AUTO'
from public.accounts a
join public.assets s on s.user_id = a.user_id
where a.user_id = '22222222-2222-2222-2222-222222222222'
  and s.symbol = 'MSFT';

commit;

-- ---------------------------------------------------------------------
-- 6. IDs de referencia para las pruebas
-- ---------------------------------------------------------------------
create table public._rls_test_ids (
  key text primary key,
  id uuid not null
);

insert into public._rls_test_ids (key, id)
select 'account1', id from public.accounts
where user_id = '11111111-1111-1111-1111-111111111111'
union all
select 'account2', id from public.accounts
where user_id = '22222222-2222-2222-2222-222222222222'
union all
select 'asset1', id from public.assets
where user_id = '11111111-1111-1111-1111-111111111111' and symbol = 'AAPL'
union all
select 'asset2', id from public.assets
where user_id = '22222222-2222-2222-2222-222222222222' and symbol = 'MSFT';

grant select on public._rls_test_ids to authenticated;

-- =====================================================================
-- 7. Pruebas como usuario 1
-- =====================================================================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- 7.1 Lecturas permitidas y denegadas
do $$
declare
  v_assets int;
  v_tx int;
  v_div int;
  v_profiles int;
  v_accounts int;
begin
  select count(*) into v_assets from public.assets;
  insert into public._rls_test_results values
    ('user1: ve sus activos', v_assets = 1, 'filas=' || v_assets);

  select count(*) into v_assets
  from public.assets
  where user_id = '22222222-2222-2222-2222-222222222222';
  insert into public._rls_test_results values
    ('user1: no ve activos de user2', v_assets = 0, 'filas=' || v_assets);

  select count(*) into v_tx from public.transactions;
  insert into public._rls_test_results values
    ('user1: ve sus operaciones', v_tx = 1, 'filas=' || v_tx);

  select count(*) into v_tx
  from public.transactions
  where user_id = '22222222-2222-2222-2222-222222222222';
  insert into public._rls_test_results values
    ('user1: no ve operaciones de user2', v_tx = 0, 'filas=' || v_tx);

  select count(*) into v_div from public.dividends;
  insert into public._rls_test_results values
    ('user1: ve sus dividendos', v_div = 1, 'filas=' || v_div);

  select count(*) into v_div
  from public.dividends
  where user_id = '22222222-2222-2222-2222-222222222222';
  insert into public._rls_test_results values
    ('user1: no ve dividendos de user2', v_div = 0, 'filas=' || v_div);

  select count(*) into v_profiles from public.users;
  insert into public._rls_test_results values
    ('user1: ve su perfil', v_profiles = 1, 'filas=' || v_profiles);

  select count(*) into v_profiles
  from public.users
  where id = '22222222-2222-2222-2222-222222222222';
  insert into public._rls_test_results values
    ('user1: no ve perfil de user2', v_profiles = 0, 'filas=' || v_profiles);

  select count(*) into v_accounts from public.accounts;
  insert into public._rls_test_results values
    ('user1: ve su cuenta', v_accounts = 1, 'filas=' || v_accounts);

  select count(*) into v_accounts
  from public.accounts
  where user_id = '22222222-2222-2222-2222-222222222222';
  insert into public._rls_test_results values
    ('user1: no ve cuenta de user2', v_accounts = 0, 'filas=' || v_accounts);
end $$;

-- 7.2 Modificaciones y borrados cruzados (deben afectar a 0 filas)
do $$
declare
  v_n int;
begin
  update public.assets set name = 'Hackeado'
  where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_n = row_count;
  insert into public._rls_test_results values
    ('user1: no modifica activo de user2', v_n = 0, 'filas=' || v_n);

  delete from public.assets
  where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_n = row_count;
  insert into public._rls_test_results values
    ('user1: no borra activo de user2', v_n = 0, 'filas=' || v_n);

  update public.users set display_name = 'Hackeado'
  where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_n = row_count;
  insert into public._rls_test_results values
    ('user1: no modifica perfil de user2', v_n = 0, 'filas=' || v_n);
end $$;

-- 7.3 Inserciones y cambios de propiedad que deben ser rechazados
do $$
begin
  -- Insertar un activo a nombre del otro usuario.
  begin
    insert into public.assets (user_id, symbol, name, asset_type, currency)
    values (
      '22222222-2222-2222-2222-222222222222',
      'HACK', 'Hack', 'STOCK', 'USD'
    );
    insert into public._rls_test_results values
      ('user1: no inserta activo para user2', false, 'la inserción no fue bloqueada');
  exception when insufficient_privilege then
    insert into public._rls_test_results values
      ('user1: no inserta activo para user2', true, 'bloqueado por RLS');
  end;

  -- Cambiar el propietario de un activo propio.
  begin
    update public.assets
    set user_id = '22222222-2222-2222-2222-222222222222'
    where user_id = '11111111-1111-1111-1111-111111111111';
    insert into public._rls_test_results values
      ('user1: no cede su activo a user2', false, 'la actualización no fue bloqueada');
  exception when insufficient_privilege then
    insert into public._rls_test_results values
      ('user1: no cede su activo a user2', true, 'bloqueado por RLS');
  end;

  -- Referenciar la cuenta del otro usuario (lo bloquea la FK compuesta).
  begin
    insert into public.transactions (
      user_id, account_id, asset_id, type, trade_date, quantity,
      unit_price, fees, currency, fx_rate_eur, fx_rate_date, fx_rate_source
    ) values (
      '11111111-1111-1111-1111-111111111111',
      (select id from public._rls_test_ids where key = 'account2'),
      (select id from public._rls_test_ids where key = 'asset1'),
      'BUY', date '2024-05-01', 1, 100, 0, 'USD', 0.92,
      date '2024-05-01', 'AUTO'
    );
    insert into public._rls_test_results values
      ('user1: no referencia cuenta de user2', false, 'la inserción no fue bloqueada');
  exception when foreign_key_violation or insufficient_privilege then
    insert into public._rls_test_results values
      ('user1: no referencia cuenta de user2', true, 'bloqueado por FK/RLS');
  end;

  -- Leer invitaciones (no hay permiso para authenticated).
  begin
    perform count(*) from public.invitations;
    insert into public._rls_test_results values
      ('user1: no lee invitaciones', false, 'la lectura no fue bloqueada');
  exception when insufficient_privilege then
    insert into public._rls_test_results values
      ('user1: no lee invitaciones', true, 'permiso denegado');
  end;
end $$;

-- =====================================================================
-- 8. Pruebas como usuario 2 (espejo)
-- =====================================================================
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_assets int;
  v_n int;
begin
  select count(*) into v_assets from public.assets;
  insert into public._rls_test_results values
    ('user2: ve sus activos', v_assets = 1, 'filas=' || v_assets);

  select count(*) into v_assets
  from public.assets
  where user_id = '11111111-1111-1111-1111-111111111111';
  insert into public._rls_test_results values
    ('user2: no ve activos de user1', v_assets = 0, 'filas=' || v_assets);

  update public.assets set name = 'Hackeado'
  where user_id = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_n = row_count;
  insert into public._rls_test_results values
    ('user2: no modifica activo de user1', v_n = 0, 'filas=' || v_n);

  begin
    insert into public.assets (user_id, symbol, name, asset_type, currency)
    values (
      '11111111-1111-1111-1111-111111111111',
      'HACK2', 'Hack', 'STOCK', 'USD'
    );
    insert into public._rls_test_results values
      ('user2: no inserta activo para user1', false, 'la inserción no fue bloqueada');
  exception when insufficient_privilege then
    insert into public._rls_test_results values
      ('user2: no inserta activo para user1', true, 'bloqueado por RLS');
  end;
end $$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;

-- =====================================================================
-- 9. Resultados
-- =====================================================================
select
  test,
  case when passed then 'PASS' else 'FAIL' end as result,
  detail
from public._rls_test_results
order by test;

do $$
declare
  v_total int;
  v_failed int;
begin
  select count(*), count(*) filter (where not passed)
  into v_total, v_failed
  from public._rls_test_results;

  if v_failed = 0 then
    raise notice 'RESULTADO: % comprobaciones, todas PASS.', v_total;
  else
    raise warning 'RESULTADO: % comprobaciones, % FAIL.', v_total, v_failed;
  end if;
end $$;

-- =====================================================================
-- 10. Limpieza
-- Borra usuarios, datos de prueba y tablas auxiliares.
-- Comenta este bloque si quieres inspeccionar los datos después.
-- =====================================================================
drop table if exists public._rls_test_results;
drop table if exists public._rls_test_ids;

delete from public.invitations
where email in ('rls-test-1@example.com', 'rls-test-2@example.com');

delete from auth.users
where email in ('rls-test-1@example.com', 'rls-test-2@example.com');
