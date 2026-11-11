import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// En desarrollo el comando se ejecuta desde apps/api; el .env vive en la raíz.
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
  }
}

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  COOKIE_SECURE: booleanFromEnv.default(false),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  DEFAULT_BENCHMARK_SYMBOL: z
    .string()
    .regex(/^[A-Z0-9.^=-]{1,20}$/)
    .default('URTH'),
  MARKET_USER_AGENT: z.string().min(3).default('CarteraInversion/0.1'),
  MARKET_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  MARKET_CACHE_QUOTE_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  INVITE_BASE_URL: z.string().url().optional(),
  INVITE_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  LOGIN_MAX_FAILURES_PER_EMAIL: z.coerce.number().int().min(1).max(100).default(5),
  LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // No se imprimen valores, solo los nombres de las variables que faltan.
  throw new Error(`Configuración inválida. Revisa el archivo .env:\n${details}`);
}

export const config = Object.freeze({
  ...parsed.data,
  apiPrefix: '/api/v1',
  accessTokenMaxAgeSeconds: 15 * 60,
  refreshTokenMaxAgeSeconds: 7 * 24 * 60 * 60,
  inviteBaseUrl: parsed.data.INVITE_BASE_URL ?? parsed.data.APP_ORIGIN,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
