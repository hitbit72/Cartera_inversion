# Cartera de inversión

Aplicación web multiusuario para gestionar una cartera personal de acciones, ETF y criptomonedas: compras, ventas, dividendos, posiciones, plusvalías y rentabilidad, con precios de mercado y conversión de divisas.

La API está terminada y probada contra un Supabase real. El frontend (React + Vite) se añadirá en la siguiente fase.

## Stack

| Capa | Tecnología |
|---|---|
| API | Node.js 22+ · Express 5 · TypeScript estricto |
| Base de datos y autenticación | Supabase (PostgreSQL + GoTrue) con Row Level Security |
| Cálculos | `decimal.js` (precisión decimal, sin errores de coma flotante) |
| Validación | `zod` compartido entre cliente y servidor (`packages/shared`) |
| Datos de mercado | Yahoo Finance (precios) y Frankfurter (divisas), con caché en PostgreSQL |
| Pruebas | Vitest + Supertest |

Decisiones de diseño detalladas: [`docs/01-arquitectura.md`](docs/01-arquitectura.md), [`docs/02-esquema-bd.md`](docs/02-esquema-bd.md) y [`docs/03-api-rest.md`](docs/03-api-rest.md).

## Estructura

```text
apps/api/            API Express: rutas, servicios, cálculos, CLI de invitaciones
packages/shared/     Constantes, tipos y esquemas zod compartidos
supabase/migrations/ Migraciones SQL (0001 → 0008)
supabase/tests/      Pruebas de aislamiento RLS
docs/                Arquitectura, esquema y especificación de la API
```

## Requisitos

- Node.js 22 o superior y npm 10+.
- Un proyecto de Supabase (plan gratuito suficiente).
- No se necesita Docker ni PostgreSQL local: la base de datos vive en Supabase.

## 1. Preparar Supabase

1. Crea el proyecto en <https://supabase.com>.
2. Abre **SQL Editor** y ejecuta los archivos de `supabase/migrations/` **en orden**, uno por uno:
   `0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007` → `0008`.
3. En **Authentication → Providers → Email**, desactiva *Allow new users to sign up*.
   El registro solo se hace desde la API y siempre con una invitación previa.
4. Opcional pero recomendable: configura SMTP propio en **Authentication → Emails** para que funcionen los correos de recuperación de contraseña.
5. Copia de **Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → `SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (**nunca** la expongas en el navegador)

Las migraciones ya se validaron contra un proyecto real y el script
`supabase/tests/rls_isolation.sql` verifica el aislamiento entre usuarios
(23/23 comprobaciones correctas; ver `supabase/tests/Resultado de test.md`).

## 2. Configurar el entorno

En la raíz del proyecto:

```bash
cp .env.example .env
```

Rellena al menos estas variables:

```dotenv
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:5173
COOKIE_SECURE=false

SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

LOG_LEVEL=info
LOGIN_MAX_FAILURES_PER_EMAIL=5
LOGIN_WINDOW_MINUTES=15
```

Notas:

- `APP_ORIGIN` debe ser el origen **exacto** del frontend (esquema, dominio y puerto). Se usa para CSRF y para los enlaces de recuperación. En producción será `https://tu-dominio.com`.
- `COOKIE_SECURE=false` solo en local con HTTP. En producción con HTTPS debe ser `true`.
- El `.env` está ignorado por Git. No lo subas ni lo compartas.

## 3. Instalar y arrancar

```bash
npm install
npm run dev
```

La API escucha en `http://localhost:3000` (el frontend en desarrollo hará proxy same-origin, así que las cookies funcionan sin CORS). Comprueba:

```bash
curl http://localhost:3000/health
# {"status":"ok","database":"ok"}
```

En desarrollo el frontend debe servirse desde `http://localhost:5173` y redirigir `/api` a `http://localhost:3000`.

## 4. Crear usuarios (solo por invitación)

El propietario del servidor crea una invitación con la clave `service_role`:

```bash
npm run invite -- --email persona@ejemplo.com
```

El comando imprime un enlace `http://localhost:5173/registro?token=...`. Envíalo al invitado. Otras opciones:

```bash
npm run invite -- --list
npm run invite -- --revoke <uuid>
```

El token se guarda únicamente como hash SHA-256, caduca a los 7 días y es de un solo uso. El correo de la invitación es el que se usará en el registro: no se puede cambiar.

## 5. Scripts

| Comando | Función |
|---|---|
| `npm run dev` | API en modo desarrollo con recarga (`tsx watch`). |
| `npm run build` | Compila `packages/shared` y `apps/api` a `dist/`. |
| `npm start` | Ejecuta la API compilada (`node apps/api/dist/server.js`). |
| `npm run typecheck` | TypeScript en modo estricto en todos los paquetes. |
| `npm test` | Pruebas unitarias y de API (Vitest + Supertest). |
| `npm run invite -- ...` | CLI de invitaciones. |

## 6. Pruebas

```bash
npm test
```

Cubren, entre otras cosas:

- FIFO y coste medio con comisiones y tipos de cambio.
- Detección de ventas sin posición suficiente.
- Plusvalías realizadas y no realizadas, dividendos y conversión a la divisa base.
- Serie histórica, TWR sin contar aportaciones como rentabilidad y XIRR.
- Validación de los contratos zod y errores RFC 7807.
- CSRF, cabeceras de seguridad y exigencia de autenticación.

Las pruebas no necesitan Supabase: las de API solo llegan hasta validación, CSRF y autenticación.

## 7. API

Base: `/api/v1`. Formato JSON; importes y cantidades como **cadenas decimales**.
Errores RFC 7807 (`application/problem+json`). Sesión con cookies `HttpOnly`:
`cartera_at` (15 min) y `cartera_rt` (7 días, rotación).

Endpoints principales:

| Grupo | Rutas |
|---|---|
| Sesión | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET/PATCH /auth/me`; `POST /auth/password`, `/auth/password/forgot`, `/auth/password/reset` |
| Activos | `GET/POST /assets`; `GET/PATCH/DELETE /assets/{id}` |
| Operaciones | `GET/POST /transactions`; `GET/PATCH/DELETE /transactions/{id}` |
| Dividendos | `GET/POST /dividends`; `GET/PATCH/DELETE /dividends/{id}` |
| Cartera | `GET /portfolio`, `/portfolio/history`, `/portfolio/allocation`, `/portfolio/performance`, `/portfolio/dividends` |
| Mercado | `GET /market/quotes`, `/market/history/{symbol}`, `/market/fx`, `/market/instruments`; `POST /market/refresh` |
| Salud | `GET /health` (fuera de `/api/v1`) |

Contrato completo, parámetros y ejemplos: [`docs/03-api-rest.md`](docs/03-api-rest.md).

## 8. Despliegue en un servidor propio

1. Instala Node.js 22 LTS y clona el proyecto.
2. `npm ci && npm run build`.
3. Crea `/etc/cartera.env` (propiedad de root, permisos `600`) con las variables de producción. Usa `NODE_ENV=production`, `COOKIE_SECURE=true`, `APP_ORIGIN=https://tu-dominio.com` y las claves de Supabase.
4. Servicio systemd de ejemplo:

   ```ini
   [Unit]
   Description=API Cartera de inversión
   After=network.target

   [Service]
   Type=simple
   User=cartera
   WorkingDirectory=/srv/cartera
   EnvironmentFile=/etc/cartera.env
   ExecStart=/usr/bin/node apps/api/dist/server.js
   Restart=always
   NoNewPrivileges=true
   PrivateTmp=true

   [Install]
   WantedBy=multi-user.target
   ```

5. Reverse proxy con HTTPS (Nginx o Caddy) hacia `127.0.0.1:3000`, sirviendo el frontend y `/api` desde el **mismo dominio**. La API no habilita CORS a propósito.
6. Con proxy delante, la API activa `trust proxy` en producción para que los límites de intentos usen la IP real.
7. El CLI de invitaciones se ejecuta en el servidor con el mismo `EnvironmentFile`:

   ```bash
   sudo -u cartera env $(cat /etc/cartera.env | xargs) npm run invite -- --email persona@ejemplo.com
   ```

8. Copias de seguridad: activa las backups de Supabase o programa `pg_dump` diario de las tablas `public.*`.

## 9. Seguridad

- Contraseñas gestionadas por Supabase Auth con hash; la API solo comprueba fortaleza (12–72 caracteres y variedad) y no las almacena.
- Registro cerrado: solo se crea cuenta consumiendo una invitación válida y de un solo uso.
- Cookies `HttpOnly`, `Secure` en producción, `SameSite=Lax` y `Path` restringido.
- CSRF: `Origin` debe coincidir con `APP_ORIGIN` en métodos mutantes y el cuerpo debe ser `application/json`.
- Helmet añade cabeceras de seguridad; los errores no filtran detalles internos.
- Límite de intentos por IP y por email, con `Retry-After`.
- Row Level Security activo en todas las tablas: cada usuario solo ve sus filas. La API usa un cliente Supabase con el JWT del usuario, de modo que RLS se aplica incluso si una consulta olvidara filtrar por `user_id`.
- `service_role` solo se usa en el CLI de invitaciones y en las cachés globales de mercado. No se envía al cliente.
- Secretos mediante variables de entorno; `.env` fuera del control de versiones.

## 10. Limitaciones conocidas

- El límite de fallos de login por email y las cachés en memoria son por proceso: válido para una sola instancia. Si se escala horizontalmente, hay que moverlos a Redis/PostgreSQL.
- Yahoo Finance no es una API oficial: el proveedor está detrás de una capa de abstracción y hay entrada manual de precios como respaldo. Si falla, el dashboard sigue funcionando con la última cotización en caché y muestra avisos.
- El frontend aún no está implementado; esta entrega cubre API, base de datos, migraciones, CLI y pruebas.
- Las vulnerabilidades restantes de `npm audit` corresponden a dependencias **de desarrollo** de Vitest/esbuild, no se despliegan con la API.
