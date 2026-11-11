import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const normalizedOrigin = (value: string): string => {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
};

/**
 * Defensa CSRF en profundidad:
 *  - SameSite=Lax en las cookies.
 *  - Origin debe coincidir con APP_ORIGIN en métodos mutantes.
 *  - Si no hay Origin, se acepta Sec-Fetch-Site: same-origin|same-site.
 *  - Cualquier cuerpo debe ser application/json (salvo peticiones sin cuerpo).
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const expected = normalizedOrigin(config.APP_ORIGIN);

  const originOk = origin !== undefined && normalizedOrigin(origin) === expected;
  const fetchSiteOk = origin === undefined && (fetchSite === 'same-origin' || fetchSite === 'same-site');

  if (!originOk && !fetchSiteOk) {
    next(forbidden('El origen de la petición no es válido.'));
    return;
  }

  const contentLength = Number(req.get('content-length') ?? '0');
  if (contentLength > 0) {
    const contentType = req.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      next(forbidden('El contenido debe enviarse como application/json.'));
      return;
    }
  }

  next();
};
