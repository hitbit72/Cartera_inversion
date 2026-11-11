# Supabase · migraciones y pruebas

## 1. Crear el proyecto

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Anota la **URL del proyecto**, la **anon key** y la **service_role key**. La última no debe salir del servidor.
3. En **Authentication → Providers → Email**, deja activado el proveedor de email/contraseña.
4. En **Authentication → Settings**, desactiva **Allow new users to sign up**. El alta se hará solo desde la API, previa invitación y con `service_role`.
5. Si vas a usar recuperación de contraseña por email, configura SMTP en **Authentication → SMTP**. Si no, el propietario puede resetear contraseñas desde el panel de Supabase.

## 2. Ejecutar las migraciones

En el **SQL Editor**, pega y ejecuta los archivos en este orden:

| Orden | Archivo | Contenido |
|---|---|---|
| 1 | `migrations/0001_extensions_domains_helpers.sql` | Extensiones, dominios y `updated_at`. |
| 2 | `migrations/0002_users_accounts.sql` | Perfiles, cuenta única y trigger de alta. |
| 3 | `migrations/0003_assets.sql` | Activos y precio manual. |
| 4 | `migrations/0004_transactions_dividends.sql` | Operaciones y dividendos. |
| 5 | `migrations/0005_invitations_market_cache.sql` | Invitaciones y cachés de mercado. |
| 6 | `migrations/0006_indexes.sql` | Índices. |
| 7 | `migrations/0007_rls.sql` | RLS, políticas y permisos. |

Las migraciones usan `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` y `DROP TRIGGER IF EXISTS` para poder reejecutarse en desarrollo. Aun así, si cambias una restricción inline de una tabla ya creada, necesitarás una migración nueva que la modifique.

## 3. Probar el aislamiento

En un proyecto de **desarrollo**, ejecuta `tests/rls_isolation.sql` completo.

- Crea dos usuarios con UUID fijos y datos propios.
- Simula la sesión con `SET ROLE authenticated` y `request.jwt.claims`.
- Comprueba lectura, inserción, modificación y borrado cruzados.
- Devuelve una tabla con `PASS`/`FAIL` y un resumen por `NOTICE`.
- Borra los usuarios y tablas auxiliares al final.

Si aparece `permission denied to set role authenticated`, ejecuta antes:

```sql
grant authenticated to postgres;
```

No ejecutes el script de pruebas en producción: crea usuarios y datos temporales.

## 4. Variables de entorno de la API

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
APP_ORIGIN=https://<tu-dominio>
PORT=3000
NODE_ENV=production
```

- `SUPABASE_ANON_KEY` se usa en el cliente por petición (con el JWT del usuario) y aplica RLS.
- `SUPABASE_SERVICE_ROLE_KEY` se usa solo en el CLI de invitaciones y en el planificador de precios.
- `APP_ORIGIN` se usa para validar `Origin` en las peticiones mutantes.

## 5. Invitaciones (CLI)

El comando se implementará en la API:

```bash
npm run invite -- --email amigo@example.com
```

Genera un token de 32 bytes, guarda su SHA-256 en `public.invitations`, caduca a los 7 días e imprime una URL:

```text
https://<tu-dominio>/registro?token=<token>
```

No hay endpoints de administración ni panel de administración en la aplicación.

## 6. Comprobaciones rápidas

```sql
-- ¿RLS activo en todas las tablas?
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
order by relname;

-- Políticas por tabla
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Todas las tablas de datos deben mostrar `relrowsecurity = true` y al menos una política.
