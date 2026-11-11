import type { CookieOptions, Response } from 'express';
import { config } from '../config.js';

export const ACCESS_COOKIE = 'cartera_at';
export const REFRESH_COOKIE = 'cartera_rt';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

const baseCookie: CookieOptions = {
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: 'lax',
};

export const setAuthCookies = (res: Response, session: AuthSession): void => {
  res.cookie(ACCESS_COOKIE, session.access_token, {
    ...baseCookie,
    path: config.apiPrefix,
    maxAge: (session.expires_in ?? config.accessTokenMaxAgeSeconds) * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    ...baseCookie,
    path: `${config.apiPrefix}/auth`,
    maxAge: config.refreshTokenMaxAgeSeconds * 1000,
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie, path: config.apiPrefix });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: `${config.apiPrefix}/auth` });
};
