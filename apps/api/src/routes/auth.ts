import { Router } from 'express';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ProfilePatchInput,
  RegisterInput,
  ResetPasswordInput,
} from '@cartera/shared';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profilePatchSchema,
  registerSchema,
  resetPasswordSchema,
} from '@cartera/shared';
import { authContext } from '../lib/context.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';
import { userClient } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import {
  loginLimiter,
  refreshLimiter,
  registerLimiter,
  forgotLimiter,
} from '../middleware/rate-limit.js';
import { validateBody } from '../middleware/validate.js';
import {
  changePassword,
  login,
  refreshAccessToken,
  register,
  requestPasswordReset,
  resetPassword,
  revokeSession,
} from '../services/auth.js';
import { buildUserResponse, updateProfile } from '../services/profile.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  async (req, res) => {
    const result = await register(req.validatedBody as RegisterInput);
    setAuthCookies(res, result.session);
    res.status(201).json({ user: result.user });
  },
);

authRouter.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  async (req, res) => {
    const result = await login(req.validatedBody as LoginInput);
    setAuthCookies(res, result.session);
    res.status(200).json({ user: result.user });
  },
);

authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new AppError(401, 'REFRESH_INVALID', 'No hay una sesión que renovar.');
  }

  const session = await refreshAccessToken(refreshToken).catch((error: unknown) => {
    // Sin cookies válidas el cliente debe volver a iniciar sesión.
    clearAuthCookies(res);
    throw error;
  });
  setAuthCookies(res, session);

  const user = await buildUserResponse(
    userClient(session.access_token),
    session.user.id,
    session.user.email ?? null,
  );

  res.status(200).json({ user });
});

authRouter.post('/logout', async (req, res) => {
  const accessToken = req.cookies?.[ACCESS_COOKIE];
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  await revokeSession(
    typeof accessToken === 'string' ? accessToken : undefined,
    typeof refreshToken === 'string' ? refreshToken : undefined,
  );
  clearAuthCookies(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const context = authContext(req);
  const user = await buildUserResponse(context.client, context.userId, context.email);
  res.json({ user });
});

authRouter.patch(
  '/me',
  requireAuth,
  validateBody(profilePatchSchema),
  async (req, res) => {
    const context = authContext(req);
    const user = await updateProfile(
      context.client,
      context.userId,
      context.email,
      req.validatedBody as ProfilePatchInput,
    );
    res.json({ user });
  },
);

authRouter.post(
  '/password',
  requireAuth,
  validateBody(changePasswordSchema),
  async (req, res) => {
    const context = authContext(req);
    await changePassword(
      context.userId,
      context.email,
      context.accessToken,
      req.validatedBody as ChangePasswordInput,
    );
    res.status(204).end();
  },
);

authRouter.post(
  '/password/forgot',
  forgotLimiter,
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    const input = req.validatedBody as ForgotPasswordInput;
    await requestPasswordReset(input.email);
    res.status(202).json({ status: 'accepted' });
  },
);

authRouter.post(
  '/password/reset',
  validateBody(resetPasswordSchema),
  async (req, res) => {
    await resetPassword(req.validatedBody as ResetPasswordInput);
    res.status(204).end();
  },
);
