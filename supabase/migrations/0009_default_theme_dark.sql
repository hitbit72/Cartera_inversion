-- 0009 · Tema oscuro por defecto
-- La interfaz está pensada como panel financiero oscuro, con un conmutador
-- para el tema claro. Los perfiles ya existentes conservan su preferencia.

alter table public.users
  alter column theme set default 'dark';
