import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const baseOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

let adminClient: SupabaseClient | null = null;

/**
 * Cliente con service_role. Solo se usa para:
 *  - validar/crear invitaciones y usuarios (registro),
 *  - tareas internas (caché de mercado, comprobación de salud).
 * Nunca debe usarse para leer datos de un usuario en el camino normal.
 */
export const admin = (): SupabaseClient => {
  if (!adminClient) {
    adminClient = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      baseOptions,
    );
  }
  return adminClient;
};

/** Cliente anónimo para operaciones de Supabase Auth (login, refresh, recuperación). */
export const anon = (): SupabaseClient =>
  createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, baseOptions);

/**
 * Cliente con el JWT del usuario. RLS evalúa auth.uid() con este token.
 * Se crea uno por petición: es barato y evita compartir estado entre usuarios.
 */
export const userClient = (accessToken: string): SupabaseClient =>
  createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
