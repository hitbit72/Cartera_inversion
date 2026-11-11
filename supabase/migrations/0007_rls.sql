-- =====================================================================
-- 0007 · Row Level Security y permisos
-- Cada usuario solo ve y modifica sus propias filas.
-- service_role omite RLS y se reserva para el CLI y el planificador.
-- =====================================================================

alter table public.users         enable row level security;
alter table public.accounts      enable row level security;
alter table public.assets        enable row level security;
alter table public.transactions  enable row level security;
alter table public.dividends     enable row level security;
alter table public.invitations   enable row level security;
alter table public.market_prices enable row level security;
alter table public.fx_rates      enable row level security;

-- ---------------------------------------------------------------------
-- users: perfil propio. El alta la hace el trigger; no hay INSERT/DELETE.
-- ---------------------------------------------------------------------
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------
drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists accounts_insert_own on public.accounts;
create policy accounts_insert_own on public.accounts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists accounts_update_own on public.accounts;
create policy accounts_update_own on public.accounts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists accounts_delete_own on public.accounts;
create policy accounts_delete_own on public.accounts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------
drop policy if exists assets_select_own on public.assets;
create policy assets_select_own on public.assets
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists assets_insert_own on public.assets;
create policy assets_insert_own on public.assets
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists assets_update_own on public.assets;
create policy assets_update_own on public.assets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists assets_delete_own on public.assets;
create policy assets_delete_own on public.assets
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- dividends
-- ---------------------------------------------------------------------
drop policy if exists dividends_select_own on public.dividends;
create policy dividends_select_own on public.dividends
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists dividends_insert_own on public.dividends;
create policy dividends_insert_own on public.dividends
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists dividends_update_own on public.dividends;
create policy dividends_update_own on public.dividends
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists dividends_delete_own on public.dividends;
create policy dividends_delete_own on public.dividends
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- invitations: nadie autenticado las lee ni escribe. Solo service_role.
-- La política de denegación explícita deja constancia de la intención.
-- ---------------------------------------------------------------------
drop policy if exists invitations_no_access on public.invitations;
create policy invitations_no_access on public.invitations
  for all to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------
-- Cachés globales: lectura para cualquier usuario autenticado.
-- Sin políticas de escritura: solo service_role (bypass RLS).
-- ---------------------------------------------------------------------
drop policy if exists market_prices_select_authenticated on public.market_prices;
create policy market_prices_select_authenticated on public.market_prices
  for select to authenticated
  using (true);

drop policy if exists fx_rates_select_authenticated on public.fx_rates;
create policy fx_rates_select_authenticated on public.fx_rates
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Permisos de tabla
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- Perfil: leer y actualizar el propio. El INSERT lo hace el trigger.
grant select, update on public.users to authenticated;

-- Datos de usuario: CRUD completo (RLS filtra las filas).
grant select, insert, update, delete on public.accounts      to authenticated;
grant select, insert, update, delete on public.assets        to authenticated;
grant select, insert, update, delete on public.transactions  to authenticated;
grant select, insert, update, delete on public.dividends     to authenticated;

-- Cachés: solo lectura para usuarios.
grant select on public.market_prices to authenticated;
grant select on public.fx_rates      to authenticated;

-- Invitaciones: nadie salvo service_role.
revoke all on public.invitations from anon, authenticated;

-- Refuerzo: anon no accede a ninguna tabla de datos.
revoke all on public.users, public.accounts, public.assets,
             public.transactions, public.dividends,
             public.market_prices, public.fx_rates
  from anon;

-- Escrituras de mercado solo por service_role.
revoke insert, update, delete on public.market_prices from anon, authenticated;
revoke insert, update, delete on public.fx_rates      from anon, authenticated;

-- service_role: tareas internas (CLI de invitaciones y planificador).
grant select, insert, update, delete on public.users         to service_role;
grant select, insert, update, delete on public.accounts      to service_role;
grant select, insert, update, delete on public.assets        to service_role;
grant select, insert, update, delete on public.transactions  to service_role;
grant select, insert, update, delete on public.dividends     to service_role;
grant select, insert, update, delete on public.invitations   to service_role;
grant select, insert, update, delete on public.market_prices to service_role;
grant select, insert, update, delete on public.fx_rates      to service_role;
