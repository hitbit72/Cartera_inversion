import type { RequestHandler } from 'express';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { unauthenticated } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { userClient } from '../lib/supabase.js';

/**
 * Exige un access token válido en la cookie HttpOnly y prepara un cliente
 * de Supabase con el JWT del usuario, de modo que RLS se aplique siempre.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw unauthenticated('Inicia sesión para continuar.');
    }

    const verified = await verifyAccessToken(token);
    req.auth = verified;
    req.supabase = userClient(verified.accessToken);
    next();
  } catch (error) {
    next(error);
  }
};
