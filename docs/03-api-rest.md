# 03 · Especificación de la API REST

Base: `https://<tu-dominio>/api/v1`
Formato: JSON UTF-8. Fechas de negocio `YYYY-MM-DD`; marcas de tiempo ISO 8601 UTC.
Importes y cantidades: **cadenas decimales** (por ejemplo `"1234.56000000"`), nunca números JSON, para no perder precisión.

## 1. Convenciones

| Tema | Regla |
|---|---|
| Versionado | Prefijo `/api/v1`. Un cambio incompatible implica `/api/v2`; los campos nuevos son aditivos. |
| Nombres | `snake_case` en todo el contrato. |
| Recursos | Sustantivos en plural; sin verbos en la ruta salvo acciones de autenticación y refresco. |
| Fechas | `trade_date`, `payment_date`, `from`, `to` en `YYYY-MM-DD`. |
| Decimales | Se devuelven como string; el cliente usa `decimal.js` para operar y `Number` solo para dibujar. |
| Errores | RFC 7807 (`application/problem+json`) con un campo estable `code`. |
| Paginación | Cursor opaco en operaciones y dividendos; listas acotadas (activos) se devuelven completas. |
| Ordenación | Fija por fecha descendente e `id` descendente; no se acepta `sort` arbitrario. |
| CORS | No se habilita: frontend y API comparten origen. |
| Tamaño de cuerpo | Máximo 100 KB. |

### Respuesta paginada

```json
{
  "data": [],
  "pagination": {
    "next_cursor": "MjAyNi0xMS0wOXx1dWlk",
    "has_more": false
  }
}
```

`limit` por defecto 50, máximo 200. `cursor` es base64url de `fecha|id` y no debe interpretarse en el cliente.

## 2. Autenticación y sesión

### 2.1 Flujo

1. El propietario crea una invitación con el CLI del servidor y envía el enlace.
2. El invitado abre `/registro?token=...`, introduce nombre y contraseña.
3. `POST /auth/register` valida la invitación, crea el usuario en Supabase Auth y abre sesión.
4. Las peticiones posteriores llevan cookies `HttpOnly`; el frontend no maneja tokens.
5. El access token caduca a los **15 minutos**. `POST /auth/refresh` lo renueva usando el refresh token (7 días, rotación activada).
6. `POST /auth/logout` revoca la sesión y borra las cookies.

### 2.2 Cookies

| Cookie | Contenido | Atributos |
|---|---|---|
| `cartera_at` | Access token JWT | `HttpOnly; Secure; SameSite=Lax; Path=/api/v1; Max-Age=900` |
| `cartera_rt` | Refresh token | `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=604800` |

- El access token se verifica localmente con el JWKS de Supabase (`jose`), validando `iss`, `aud=authenticated`, `exp` y `sub`.
- No se puede revocar un access token antes de que caduque; por eso su vida es de 15 minutos.
- El refresh token se rota en cada uso; reutilizar uno viejo invalida la sesión (comportamiento de Supabase).

### 2.3 CSRF

- `SameSite=Lax` impide que una web externa envíe cookies en peticiones mutantes.
- Además, todo método distinto de `GET/HEAD` exige `Origin` (o `Sec-Fetch-Site: same-origin`) coincidente con el dominio configurado; si falta o no coincide, `403`.
- No se aceptan peticiones con `Content-Type` distinto de `application/json`, salvo el flujo de recuperación.

### 2.4 Límites de intentos

| Endpoint | Límite |
|---|---|
| `POST /auth/login` | 5 fallos / 15 min por email + 20 / 15 min por IP |
| `POST /auth/register` | 5 / hora por IP |
| `POST /auth/password/forgot` | 3 / hora por email + 10 / hora por IP |
| `POST /market/refresh` | 1 / minuto por usuario |
| Resto de la API | 300 / minuto por usuario/IP |

Se devuelve `429` con `Retry-After`. El bloqueo por email es temporal (15 minutos) y no revela si el correo existe.

## 3. Resumen de endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` | No | Aceptar invitación y crear cuenta. |
| POST | `/auth/login` | No | Iniciar sesión. |
| POST | `/auth/refresh` | Refresh | Renovar access token. |
| POST | `/auth/logout` | Sí | Cerrar sesión y revocar refresh. |
| GET | `/auth/me` | Sí | Perfil y preferencias. |
| PATCH | `/auth/me` | Sí | Actualizar perfil y preferencias. |
| POST | `/auth/password` | Sí | Cambiar contraseña. |
| POST | `/auth/password/forgot` | No | Solicitar recuperación. |
| POST | `/auth/password/reset` | No | Establecer nueva contraseña con tokens de recuperación. |
| GET | `/assets` | Sí | Listar activos. |
| POST | `/assets` | Sí | Crear activo. |
| GET | `/assets/{id}` | Sí | Ver activo. |
| PATCH | `/assets/{id}` | Sí | Editar clasificación o precio manual. |
| DELETE | `/assets/{id}` | Sí | Borrar activo sin operaciones. |
| GET | `/transactions` | Sí | Listar operaciones. |
| POST | `/transactions` | Sí | Registrar compra o venta. |
| GET | `/transactions/{id}` | Sí | Ver operación. |
| PATCH | `/transactions/{id}` | Sí | Editar operación. |
| DELETE | `/transactions/{id}` | Sí | Borrar operación. |
| GET | `/dividends` | Sí | Listar dividendos. |
| POST | `/dividends` | Sí | Registrar dividendo. |
| GET | `/dividends/{id}` | Sí | Ver dividendo. |
| PATCH | `/dividends/{id}` | Sí | Editar dividendo. |
| DELETE | `/dividends/{id}` | Sí | Borrar dividendo. |
| GET | `/portfolio` | Sí | Cartera actual y totales. |
| GET | `/portfolio/history` | Sí | Evolución y benchmark. |
| GET | `/portfolio/allocation` | Sí | Distribución por dimensión. |
| GET | `/portfolio/performance` | Sí | TWR, XIRR y resumen. |
| GET | `/portfolio/dividends` | Sí | Dividendos agrupados. |
| GET | `/market/quotes` | Sí | Cotizaciones actuales (lote). |
| GET | `/market/history/{symbol}` | Sí | Histórico diario. |
| GET | `/market/fx` | Sí | Tipo de cambio. |
| GET | `/market/instruments` | Sí | Buscar instrumentos en Yahoo. |
| POST | `/market/refresh` | Sí | Forzar refresco de datos del usuario. |
| GET | `/health` | No | Estado del servicio (fuera de `/api/v1`). |

Las invitaciones **no tienen endpoints**: se gestionan por CLI con `service_role` (ver sección 11).

## 4. Autenticación

### `POST /auth/register`

Acepta una invitación. El email se toma de la invitación, no del cuerpo.

```json
{
  "token": "base64url_de_32_bytes",
  "display_name": "Ana Pérez",
  "password": "una-frase-larga-y-segura"
}
```

`201 Created` + cookies + `{ "user": { ... } }`.

Errores: `401 INVITATION_INVALID`, `409 INVITATION_USED`, `410 INVITATION_EXPIRED`, `409 EMAIL_EXISTS`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`.

La invitación se marca como aceptada de forma atómica antes de crear el usuario. Si Supabase rechaza la creación, se libera la invitación.

### `POST /auth/login`

```json
{ "email": "ana@example.com", "password": "..." }
```

`200 OK` + cookies + `{ "user": { ... } }`.

Errores: `401 INVALID_CREDENTIALS` (mismo mensaje para email inexistente y contraseña incorrecta), `403 EMAIL_NOT_VERIFIED`, `429 RATE_LIMITED`.

### `POST /auth/refresh`

Sin cuerpo. Usa `cartera_rt` y rota ambas cookies.

`200 OK` + `{ "user": { ... } }`. Error: `401 REFRESH_INVALID`.

### `POST /auth/logout`

Sin cuerpo. Llama a Supabase `signOut`, revoca el refresh y borra las cookies.

`204 No Content`.

### `GET /auth/me`

```json
{
  "user": {
    "id": "0f0e...",
    "email": "ana@example.com",
    "display_name": "Ana Pérez",
    "base_currency": "EUR",
    "cost_method": "FIFO",
    "benchmark_symbol": "URTH",
    "theme": "system",
    "account": { "id": "8a1b...", "name": "Mi cartera" },
    "created_at": "2026-11-09T10:00:00Z"
  }
}
```

### `PATCH /auth/me`

Campos opcionales: `display_name`, `base_currency`, `cost_method` (`FIFO`/`AVERAGE`), `benchmark_symbol` (string o `null`), `theme` (`light`/`dark`/`system`).

`200 OK` con el usuario actualizado. Cambiar `cost_method` o `base_currency` no reescribe datos: todo se recalcula al leer.

### `POST /auth/password`

```json
{ "current_password": "...", "new_password": "..." }
```

`204 No Content`. Errores: `401 INVALID_CREDENTIALS`, `422 VALIDATION_ERROR`.

### `POST /auth/password/forgot`

```json
{ "email": "ana@example.com" }
```

`202 Accepted` siempre, exista o no el correo. Requiere SMTP configurado en Supabase; si no lo está, el propietario puede resetear la contraseña desde el panel de Supabase.

### `POST /auth/password/reset`

Se usa tras abrir el enlace de recuperación. El frontend envía los tokens que Supabase incluye en la URL.

```json
{ "access_token": "...", "refresh_token": "...", "new_password": "..." }
```

`204 No Content`. `401 RESET_TOKEN_INVALID` si los tokens no son válidos.

## 5. Activos

### `GET /assets`

Query: `search` (nombre o símbolo), `type` (`STOCK|CRYPTO|ETF|FUND|BOND`).

```json
{
  "data": [
    {
      "id": "uuid",
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "asset_type": "STOCK",
      "sector": "Tecnología",
      "country": "US",
      "currency": "USD",
      "exchange": "NASDAQ",
      "isin": "US0378331005",
      "price_mode": "AUTO",
      "manual_price": null,
      "manual_price_currency": null,
      "manual_price_at": null,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

Lista completa: el número de activos de una cartera personal es acotado. Si supera 500, se aplica el límite y se indica `pagination`.

### `POST /assets`

```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "asset_type": "STOCK",
  "sector": "Tecnología",
  "country": "US",
  "currency": "USD",
  "exchange": "NASDAQ",
  "isin": "US0378331005"
}
```

`201 Created` con el activo. `409 DUPLICATE_ASSET` si ya existe `(user_id, symbol)`.

Para activos sin cobertura: añadir `"price_mode": "MANUAL"`, `"manual_price": "182.35"`, `"manual_price_currency": "USD"`.

### `GET /assets/{id}` · `PATCH /assets/{id}` · `DELETE /assets/{id}`

- `PATCH` acepta los mismos campos (parciales). Cambiar `symbol` no borra el histórico de precios antiguo, pero las nuevas consultas usan el nuevo símbolo.
- `DELETE` devuelve `204`; si hay operaciones o dividendos, `409 ASSET_IN_USE`.

## 6. Operaciones

### `GET /transactions`

Query: `asset_id`, `type` (`BUY|SELL`), `from`, `to`, `cursor`, `limit`.

```json
{
  "data": [
    {
      "id": "uuid",
      "asset_id": "uuid",
      "type": "BUY",
      "trade_date": "2026-11-09",
      "quantity": "10.0000000000",
      "unit_price": "182.35000000",
      "fees": "1.00000000",
      "currency": "USD",
      "fx_rate_eur": "0.9250000000",
      "fx_rate_date": "2026-11-09",
      "fx_rate_source": "AUTO",
      "amount_base": "1687.58750000",
      "fees_base": "0.92500000",
      "net_amount_base": "1688.51250000",
      "realized_pnl_base": null,
      "notes": null,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "pagination": { "next_cursor": null, "has_more": false }
}
```

`amount_base`, `fees_base` y `net_amount_base` están en la moneda base del usuario. `realized_pnl_base` solo tiene valor en ventas.

### `POST /transactions`

```json
{
  "asset_id": "uuid",
  "type": "BUY",
  "trade_date": "2026-11-09",
  "quantity": "10",
  "unit_price": "182.35",
  "fees": "1.00",
  "currency": "USD",
  "notes": "Compra inicial"
}
```

Reglas:

- `quantity > 0`, `unit_price >= 0`, `fees >= 0`, `trade_date` no futura.
- El activo debe pertenecer al usuario.
- En una **venta**, la cantidad no puede superar la posición disponible a esa fecha (considerando el orden `trade_date`, `created_at`). Si se supera: `422 INSUFFICIENT_POSITION`.
- Si no se envía `fx_rate_eur`, se obtiene el cambio de `trade_date` (o el último hábil anterior) y `fx_rate_source = "AUTO"`.
- Si se envía `fx_rate_eur` manual, debe ser `> 0` y `fx_rate_source = "MANUAL"`. La interfaz lo muestra como corrección manual.
- Una compra puede tener `unit_price = 0` (por ejemplo, acciones gratuitas o ajustes), pero no negativa.

`201 Created` con la operación y sus importes derivados. En ventas incluye `realized_pnl_base`.

### `PATCH /transactions/{id}`

Acepta cambios parciales. Tras aplicar el cambio se recalcula la secuencia completa del activo; si alguna venta posterior queda sin posición suficiente, se rechaza con `422 INCONSISTENT_HISTORY` y no se guarda nada.

### `DELETE /transactions/{id}`

`204` si la secuencia sigue siendo válida. Si borrar una compra deja ventas posteriores sin cubrir, `409 INCONSISTENT_HISTORY`.

## 7. Dividendos

### `GET /dividends`

Query: `asset_id`, `from`, `to`, `cursor`, `limit`.

```json
{
  "data": [
    {
      "id": "uuid",
      "asset_id": "uuid",
      "payment_date": "2026-11-09",
      "gross_amount": "100.00000000",
      "withholding_tax": "15.00000000",
      "currency": "USD",
      "fx_rate_eur": "0.9250000000",
      "fx_rate_date": "2026-11-07",
      "fx_rate_source": "AUTO",
      "net_amount": "85.00000000",
      "net_amount_base": "78.62500000",
      "notes": null,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "pagination": { "next_cursor": null, "has_more": false }
}
```

### `POST /dividends`

```json
{
  "asset_id": "uuid",
  "payment_date": "2026-11-09",
  "gross_amount": "100",
  "withholding_tax": "15",
  "currency": "USD",
  "notes": "Dividendo trimestral"
}
```

- `gross_amount > 0`.
- `0 <= withholding_tax <= gross_amount`; si no, `422 INVALID_WITHHOLDING`.
- El activo debe pertenecer al usuario.
- Se guarda el snapshot de cambio igual que en operaciones.

`201 Created` con `net_amount` y `net_amount_base`.

### `PATCH /dividends/{id}` · `DELETE /dividends/{id}`

Mismas reglas. `204` al borrar.

## 8. Cartera

### `GET /portfolio`

Query: `include_closed` (`true` para incluir posiciones cerradas con plusvalía realizada).

```json
{
  "base_currency": "EUR",
  "as_of": "2026-11-09T18:00:00Z",
  "cost_method": "FIFO",
  "fx": { "date": "2026-11-07", "source": "frankfurter", "stale": false },
  "positions": [
    {
      "asset": { "id": "uuid", "symbol": "AAPL", "name": "Apple Inc.", "asset_type": "STOCK", "sector": "Tecnología", "country": "US", "currency": "USD" },
      "quantity": "10.0000000000",
      "avg_cost_native": "182.35000000",
      "avg_cost": "168.67375000",
      "cost_basis": "1686.73750000",
      "current_price_native": "190.00000000",
      "current_price": "175.75000000",
      "price_date": "2026-11-09",
      "price_stale": false,
      "market_value": "1757.50000000",
      "unrealized_pnl": "70.76250000",
      "unrealized_pnl_pct": "4.20",
      "realized_pnl": "0.00000000",
      "dividends_net": "12.50000000",
      "total_pnl": "83.26250000",
      "weight_pct": "35.10"
    }
  ],
  "totals": {
    "market_value": "5000.00000000",
    "cost_basis": "4600.00000000",
    "unrealized_pnl": "400.00000000",
    "unrealized_pnl_pct": "8.70",
    "realized_pnl": "120.00000000",
    "dividends_net": "80.00000000",
    "total_pnl": "600.00000000",
    "total_return_pct": "12.00",
    "net_invested": "4480.00000000"
  },
  "warnings": [
    { "code": "PRICE_STALE", "symbol": "XYZ", "as_of": "2026-11-07" }
  ]
}
```

Todos los importes están en `base_currency`. `avg_cost_native` y `current_price_native` están en la divisa del activo.

### `GET /portfolio/history`

Query: `from`, `to`, `interval` (`1d|1w|1m`, por defecto `1d`), `benchmark` (`true|false`, por defecto `true`).

```json
{
  "base_currency": "EUR",
  "from": "2025-01-01",
  "to": "2026-11-09",
  "interval": "1d",
  "benchmark": { "symbol": "URTH", "name": "iShares MSCI World ETF", "currency": "USD", "stale": false },
  "series": [
    {
      "date": "2025-01-01",
      "market_value": "4000.00000000",
      "net_contributions": "4000.00000000",
      "dividends_cum": "0.00000000",
      "total_value": "4000.00000000",
      "twr_index": "100.00",
      "benchmark_index": "100.00"
    }
  ],
  "warnings": []
}
```

- `net_contributions` = compras + comisiones − ventas netas acumuladas. Es el dinero externo aportado, porque no hay cuenta de efectivo.
- `total_value` = valor de mercado + dividendos netos acumulados (se asume que los dividendos se mantienen en la cartera).
- `twr_index` y `benchmark_index` empiezan en 100 en `from`.
- Si faltan precios de un día, se arrastra el último cierre y se añade un aviso.

### `GET /portfolio/allocation`

Query: `dimension` (`asset_type|sector|country|currency|asset`), `metric` (`market_value|cost_basis`, por defecto `market_value`).

```json
{
  "dimension": "sector",
  "metric": "market_value",
  "base_currency": "EUR",
  "total": "5000.00000000",
  "items": [
    { "key": "Tecnología", "label": "Tecnología", "value": "2100.00000000", "weight_pct": "42.00" },
    { "key": "Sin clasificar", "label": "Sin clasificar", "value": "150.00000000", "weight_pct": "3.00" }
  ]
}
```

### `GET /portfolio/performance`

Query: `from`, `to` (opcionales; por defecto todo el histórico).

```json
{
  "base_currency": "EUR",
  "from": "2025-01-01",
  "to": "2026-11-09",
  "twr_pct": "18.40",
  "xirr_pct": "16.10",
  "realized_pnl": "120.00000000",
  "dividends_net": "80.00000000",
  "fees": "25.00000000",
  "net_contributions": "4480.00000000",
  "start_value": "0.00000000",
  "end_value": "5000.00000000",
  "benchmark": { "symbol": "URTH", "twr_pct": "14.20" }
}
```

`xirr_pct` puede ser `null` si no hay flujos suficientes.

### `GET /portfolio/dividends`

Query: `group_by` (`year|month|asset`, por defecto `year`), `from`, `to`.

```json
{
  "group_by": "year",
  "base_currency": "EUR",
  "total": { "gross": "300.00000000", "withholding": "45.00000000", "net": "255.00000000" },
  "items": [
    { "key": "2026", "label": "2026", "gross": "300.00000000", "withholding": "45.00000000", "net": "255.00000000" }
  ]
}
```

## 9. Datos de mercado

### `GET /market/quotes`

Query: `symbols` separados por coma (máximo 50).

```json
{
  "data": [
    { "symbol": "AAPL", "price": "190.00", "currency": "USD", "as_of": "2026-11-09T16:00:00Z", "source": "yahoo", "stale": false }
  ],
  "warnings": []
}
```

Si Yahoo falla, se devuelve el último valor cacheado con `stale: true`; solo si no hay ningún valor se responde `503 MARKET_DATA_UNAVAILABLE`.

### `GET /market/history/{symbol}`

Query: `from`, `to`, `interval` (`1d|1w|1m`).

```json
{
  "symbol": "AAPL",
  "currency": "USD",
  "candles": [
    { "date": "2026-11-07", "close": "188.50", "adjusted_close": "188.10" }
  ],
  "stale": false
}
```

### `GET /market/fx`

Query: `from` (divisa origen), `to` (divisa destino), `date` (opcional).

```json
{ "from": "USD", "to": "EUR", "date": "2026-11-07", "rate": "0.9250000000", "source": "frankfurter", "stale": false }
```

`rate` significa unidades de `to` por 1 unidad de `from`.

### `GET /market/instruments`

Query: `q` (mínimo 2 caracteres). Devuelve coincidencias de Yahoo para prefijar el formulario de alta:

```json
{
  "data": [
    { "symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "asset_type": "STOCK", "currency": "USD" }
  ]
}
```

### `POST /market/refresh`

Fuerza el refresco de cotizaciones del usuario, su benchmark y los tipos de cambio. `202 Accepted` con `{ "queued": true }`. Limitado a 1 por minuto.

### `GET /health`

Ruta fuera del prefijo versionado (`https://<dominio>/health`) para sondas de disponibilidad. Sin autenticación. `200 { "status": "ok", "database": "ok" }` o `503`. No expone versiones ni detalles internos.

## 10. Errores

Formato RFC 7807:

```json
{
  "type": "https://cartera.example/errors/insufficient-position",
  "title": "Posición insuficiente",
  "status": 422,
  "detail": "No puedes vender 5 AAPL: solo tienes 3.",
  "instance": "/api/v1/transactions",
  "code": "INSUFFICIENT_POSITION",
  "errors": [
    { "field": "quantity", "message": "Supera la posición disponible (3)." }
  ]
}
```

| Código HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `BAD_REQUEST` | JSON malformado o cuerpo no aceptado. |
| 401 | `UNAUTHENTICATED` | Sin sesión o token inválido. |
| 401 | `INVALID_CREDENTIALS` | Email o contraseña incorrectos. |
| 401 | `REFRESH_INVALID` | Refresh token caducado o revocado. |
| 401 | `INVITATION_INVALID` | Token de invitación inexistente. |
| 401 | `RESET_TOKEN_INVALID` | Tokens de recuperación inválidos. |
| 403 | `FORBIDDEN` | Origen CSRF no válido o cuenta sin verificar. |
| 404 | `NOT_FOUND` | Recurso inexistente **o de otro usuario**. |
| 409 | `EMAIL_EXISTS` | El email ya tiene cuenta. |
| 409 | `DUPLICATE_ASSET` | Ya existe el símbolo para ese usuario. |
| 409 | `ASSET_IN_USE` | El activo tiene operaciones o dividendos. |
| 409 | `INVITATION_USED` | La invitación ya se consumió. |
| 409 | `INCONSISTENT_HISTORY` | El cambio dejaría ventas sin posición. |
| 410 | `INVITATION_EXPIRED` | La invitación caducó. |
| 422 | `VALIDATION_ERROR` | Campos inválidos; incluye `errors[]`. |
| 422 | `INSUFFICIENT_POSITION` | Venta mayor que la posición. |
| 422 | `INVALID_WITHHOLDING` | Retención mayor que el bruto. |
| 422 | `INCONSISTENT_HISTORY` | Edición inválida de una operación. |
| 429 | `RATE_LIMITED` | Demasiados intentos. |
| 500 | `INTERNAL_ERROR` | Error no controlado (sin detalles internos). |
| 503 | `MARKET_DATA_UNAVAILABLE` | Sin datos de mercado ni caché. |

`instance` es la ruta de la petición; `type` es estable y configurable por dominio. El cliente decide por `code`, no por el texto.

## 11. Invitaciones (CLI)

No hay endpoints de administración. El propietario ejecuta en el servidor:

```bash
npm run invite -- --email amigo@example.com
npm run invite -- --list
npm run invite -- --revoke <id>
```

- Genera 32 bytes aleatorios, guarda el SHA-256 y caduca a los 7 días.
- Imprime una URL `https://<dominio>/registro?token=...` para enviarla a mano.
- Usa la `service_role` key; nunca se ejecuta desde el navegador.
- No se puede invitar a un email que ya tenga cuenta.

## 12. Validaciones

| Campo | Regla |
|---|---|
| `email` | Formato válido, máximo 254 caracteres, normalizado a minúsculas. |
| `password` | 12–72 caracteres, `zxcvbn` ≥ 3, distinta del email y del nombre. |
| `display_name` | 1–80 caracteres, sin espacios al inicio/final. |
| `symbol` | 1–20, `^[A-Z0-9.\-^=]+$`, se normaliza a mayúsculas. |
| `asset_type` | `STOCK`, `CRYPTO`, `ETF`, `FUND`, `BOND`. |
| `country` | ISO 3166-1 alpha-2 o `null`. |
| `currency` | Una de las 14 divisas soportadas. |
| `base_currency` | Una de las 14 divisas soportadas. |
| `quantity` | `> 0`, máximo 10 decimales. |
| `unit_price` | `>= 0`, máximo 8 decimales. |
| `fees` | `>= 0`, máximo 8 decimales. |
| `gross_amount` | `> 0`, máximo 8 decimales. |
| `withholding_tax` | `>= 0` y `<= gross_amount`. |
| `trade_date` / `payment_date` | `YYYY-MM-DD`, entre 1900-01-01 y hoy. |
| `notes` | Máximo 1000 caracteres; se escapan al renderizar. |
| `limit` | 1–200. |
| `cursor` | Base64url válido; si no, `422`. |

La validación se aplica **dos veces**: Zod en el cliente para feedback inmediato y Zod en el servidor como fuente de verdad.

## 13. Cálculos financieros

Se trabaja siempre en EUR con `decimal.js`; la moneda base solo se aplica al presentar.

### 13.1 Conversión

```text
importe_eur      = cantidad × precio_unitario × fx_rate_eur
comisiones_eur   = comisiones × fx_rate_eur
coste_compra_eur = importe_eur + comisiones_eur
ingreso_venta_eur = importe_eur − comisiones_eur
```

`fx_rate_eur` es el snapshot de la operación (EUR por 1 unidad de su divisa).

### 13.2 FIFO

Cada compra crea un lote:

```text
coste_unitario_lote = coste_compra_eur / cantidad
```

Cada venta consume lotes del más antiguo al más nuevo:

```text
plusvalia_realizada = ingreso_venta_eur − Σ(cantidad_consumida × coste_unitario_lote)
```

Si los lotes no cubren la venta: `422 INSUFFICIENT_POSITION`.

**Ejemplo**

| Movimiento | Cálculo | Lote |
|---|---|---|
| Compra 10 @ 100 USD, comisión 5, FX 0,90 | (1000 + 5) × 0,90 = 904,50 € | 10 × 90,45 € |
| Compra 5 @ 120 USD, comisión 0, FX 0,95 | 600 × 0,95 = 570,00 € | 5 × 114,00 € |
| Venta 12 @ 130 USD, comisión 2, FX 1,00 | (1560 − 2) × 1,00 = 1558,00 € | consume 10 + 2 |

Plusvalía realizada = 1558,00 − (904,50 + 228,00) = **425,50 €**. Quedan 3 unidades a 114,00 €.

### 13.3 Coste medio

```text
coste_medio_nuevo = (coste_medio_anterior × cantidad_anterior + coste_compra_eur) / (cantidad_anterior + cantidad_compra)
plusvalia_realizada = ingreso_venta_eur − cantidad_vendida × coste_medio
```

Con el ejemplo anterior: coste medio tras las compras = (904,50 + 570,00) / 15 = 98,30 €. Venta de 12: 1558,00 − 1179,60 = **378,40 €**. Quedan 3 a 98,30 € (294,90 €).

### 13.4 Posición y plusvalía no realizada

```text
cantidad        = Σ compras − Σ ventas
coste_abierto   = Σ coste de lotes no consumidos (FIFO) o cantidad × coste medio
valor_mercado   = cantidad × precio_actual × fx_actual
plusvalia_no_realizada = valor_mercado − coste_abierto
porcentaje      = plusvalia_no_realizada / coste_abierto × 100
```

### 13.5 Dividendos

```text
neto         = bruto − retención
neto_eur     = neto × fx_rate_eur
rendimiento  = plusvalía realizada + plusvalía no realizada + dividendos netos
```

### 13.6 Rentabilidad en el tiempo

Con una serie diaria de valor de mercado `V_t`, dividendos acumulados `D_t` y flujos externos `F_t` (compras + comisiones − ventas netas):

```text
r_t = (V_t + D_t − F_t) / (V_{t−1} + D_{t−1}) − 1
TWR = Π(1 + r_t) − 1
```

Se asume que no hay cuenta de efectivo: cada compra es una aportación externa y cada venta una retirada. Los dividendos se consideran rendimiento retenido, no retirada. La interfaz lo explica junto al gráfico.

XIRR se calcula con los flujos fechados (compras negativas, ventas y dividendos positivos, valor final positivo) y puede ser `null` si no hay suficientes datos.

### 13.7 Benchmark

Se descarga el histórico del símbolo configurado, se usan cierres ajustados (incluyen dividendos), se convierte a EUR con el cambio diario y se indexa a 100 en la fecha inicial. Se compara con `twr_index` de la cartera.

## 14. Aislamiento de datos

1. **Autenticación:** la API valida el JWT y obtiene `user.id`. Sin token válido no se ejecuta ninguna consulta.
2. **Cliente por petición:** se crea un cliente de Supabase con el access token del usuario; RLS evalúa `auth.uid()`.
3. **Filtro explícito:** todas las consultas y escrituras añaden `user_id = user.id`. El `user_id` nunca se acepta del cliente.
4. **Comprobación de propiedad:** al buscar por `:id` se filtra también por `user_id`; si no aparece, `404`.
5. **Escrituras derivadas:** `account_id` se resuelve en el servidor a partir del usuario; no se confía en el valor enviado.
6. **Base de datos:** RLS activo en todas las tablas de datos de usuario (`accounts`, `assets`, `transactions`, `dividends`) con políticas de SELECT/INSERT/UPDATE/DELETE. El perfil (`users`) permite SELECT/UPDATE del propio registro; su alta la hace el trigger. Las tablas globales de mercado son de solo lectura para `authenticated`.
7. **Service role:** solo en el CLI de invitaciones y en el planificador de precios; nunca en el camino de una petición normal (la única excepción es el alta de usuario en `/auth/register`, que primero valida una invitación).
8. **Respuestas:** los errores no distinguen entre “no existe” y “es de otro usuario”.

## 15. Proveedores de mercado (capa de abstracción)

```ts
type Quote = {
  symbol: string;
  price: string;
  currency: string;
  as_of: string;
  source: "yahoo" | "manual";
  stale: boolean;
};

type Candle = { date: string; close: string; adjusted_close?: string };

interface MarketDataProvider {
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getDailyHistory(symbol: string, from: string, to: string): Promise<Candle[]>;
  searchInstruments(query: string): Promise<Instrument[]>;
}

interface FxProvider {
  // Devuelve EUR→X para la fecha (o el último hábil anterior).
  getEurRates(date: string): Promise<Map<string, string>>;
}
```

Implementaciones previstas:

- `YahooMarketDataProvider` (principal).
- `FrankfurterFxProvider` (BCE, sin clave).
- `ManualPriceProvider` (lee `assets.price_mode = MANUAL`).

Comportamiento ante fallos:

- Timeout de 5 s y 2 reintentos con retroceso exponencial.
- Cortacircuitos: 5 fallos en 60 s → no se llama al proveedor durante 5 minutos; se sirve caché.
- `stale-while-revalidate`: si hay caché, se responde de inmediato y se refresca en segundo plano.
- La caché vive en `market_prices` y `fx_rates`; el planificador la actualiza cada 15 minutos en horario de mercado y una vez al día para históricos y divisas.
- Un fallo de Yahoo nunca devuelve `500` en `/portfolio`: se usan los últimos precios y se añade `warnings`.

## 16. Checklist de seguridad de la API

- [x] Helmet con CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- [x] Cookies `HttpOnly`, `Secure`, `SameSite=Lax`, `Path` restringido.
- [x] Validación de `Origin`/`Sec-Fetch-Site` en mutaciones.
- [x] Límites de intentos y de tamaño de cuerpo.
- [x] Zod en cliente y servidor.
- [x] RLS + filtros explícitos por usuario.
- [x] `service_role` solo en tareas internas.
- [x] Secretos en variables de entorno; `.env` ignorado por Git.
- [x] Errores sin trazas ni datos internos.
- [x] Logs sin tokens ni contraseñas.
- [x] HTTPS obligatorio en producción (Caddy).
- [x] Copias de seguridad de Supabase activadas.
- [x] Dependencias auditadas (`npm audit`) en CI.

## 17. Ejemplos

### Login

```http
POST /api/v1/auth/login HTTP/1.1
Content-Type: application/json

{ "email": "ana@example.com", "password": "mi-frase-larga" }
```

```http
HTTP/1.1 200 OK
Set-Cookie: cartera_at=...; HttpOnly; Secure; SameSite=Lax; Path=/api/v1; Max-Age=900
Set-Cookie: cartera_rt=...; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth; Max-Age=604800
Content-Type: application/json

{ "user": { "id": "0f0e...", "email": "ana@example.com", "display_name": "Ana Pérez", "base_currency": "EUR", "cost_method": "FIFO", "benchmark_symbol": "URTH", "theme": "system", "account": { "id": "8a1b...", "name": "Mi cartera" } } }
```

### Compra

```http
POST /api/v1/transactions HTTP/1.1
Content-Type: application/json

{
  "asset_id": "c1d2...",
  "type": "BUY",
  "trade_date": "2026-11-09",
  "quantity": "10",
  "unit_price": "182.35",
  "fees": "1.00",
  "currency": "USD"
}
```

```json
{
  "id": "e5f6...",
  "asset_id": "c1d2...",
  "type": "BUY",
  "trade_date": "2026-11-09",
  "quantity": "10.0000000000",
  "unit_price": "182.35000000",
  "fees": "1.00000000",
  "currency": "USD",
  "fx_rate_eur": "0.9250000000",
  "fx_rate_date": "2026-11-09",
  "fx_rate_source": "AUTO",
  "amount_base": "1687.58750000",
  "fees_base": "0.92500000",
  "net_amount_base": "1688.51250000",
  "realized_pnl_base": null,
  "notes": null
}
```

### Error de venta

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
  "type": "https://cartera.example/errors/insufficient-position",
  "title": "Posición insuficiente",
  "status": 422,
  "detail": "No puedes vender 5 AAPL: solo tienes 3.",
  "instance": "/api/v1/transactions",
  "code": "INSUFFICIENT_POSITION",
  "errors": [{ "field": "quantity", "message": "Supera la posición disponible (3)." }]
}
```
