-- =====================================================================
-- 0008 · Benchmark por defecto
-- El usuario nuevo compara contra URTH (MSCI World) sin configurar nada.
-- Dejar la columna a NULL sigue desactivando la comparación.
-- Idempotente: se puede reejecutar sin efecto adicional.
-- =====================================================================

alter table public.users
  alter column benchmark_symbol set default 'URTH';

comment on column public.users.benchmark_symbol is
  'Símbolo de Yahoo Finance del índice de referencia. NULL desactiva la comparación.';
