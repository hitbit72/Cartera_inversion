import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { unauthenticated } from './errors.js';
import { anon } from './supabase.js';

export interface VerifiedToken {
  userId: string;
  email: string | null;
  accessToken: string;
}

const jwks = createRemoteJWKSet(
  new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  {
    timeoutDuration: 5000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  },
);

/**
 * Verifica el access token localmente con el JWKS de Supabase.
 * Si el proyecto usa firma simétrica (HS256) o el JWKS no está disponible,
 * se recurre a GoTrue (getUser) como red de seguridad.
 */
export const verifyAccessToken = async (token: string): Promise<VerifiedToken> => {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${config.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });

    if (!payload.sub) throw new Error('Token sin sub');

    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      accessToken: token,
    };
  } catch {
    const { data, error } = await anon().auth.getUser(token);
    if (error || !data.user) {
      throw unauthenticated('La sesión no es válida o ha caducado.');
    }
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      accessToken: token,
    };
  }
};
