import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserResponse,
} from '@cartera/shared';
import type { Session } from '@supabase/supabase-js';
import { config } from '../config.js';
import { AppError, conflict } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { admin, anon, userClient } from '../lib/supabase.js';
import { emailFailureTracker } from '../middleware/rate-limit.js';
import { claimInvitation, invitationError, releaseInvitation } from './invitations.js';
import { assertPasswordStrength } from './password.js';
import { buildUserResponse } from './profile.js';

export interface AuthResult {
  session: Session;
  user: UserResponse;
}

const isRateLimit = (error: { status?: number; code?: string } | null): boolean =>
  error !== null &&
  (error.status === 429 ||
    error.code === 'over_request_rate_limit' ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'too_many_requests');

const isExistingUser = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  return (
    error.code === 'email_exists' ||
    error.code === 'user_already_exists' ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  );
};

/* ------------------------------------------------------------------ */
/* Registro por invitación                                             */
/* ------------------------------------------------------------------ */

export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const claim = await claimInvitation(input.token);
  if (claim.status !== 'ok') throw invitationError(claim);

  const invitation = claim.invitation;
  let createdUserId: string | null = null;

  try {
    assertPasswordStrength(input.password, invitation.email, input.display_name);

    const { data: created, error: createError } = await admin().auth.admin.createUser({
      email: invitation.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: input.display_name },
    });

    if (createError || !created.user) {
      if (isExistingUser(createError)) {
        throw conflict('EMAIL_EXISTS', 'Ya existe una cuenta con ese correo.');
      }
      logger.error({ err: createError }, 'Registro: fallo al crear el usuario');
      throw new AppError(500, 'INTERNAL_ERROR', 'No se pudo crear la cuenta.');
    }

    createdUserId = created.user.id;

    const { data: signIn, error: signInError } = await anon().auth.signInWithPassword({
      email: invitation.email,
      password: input.password,
    });

    if (signInError || !signIn.session || !signIn.user) {
      logger.error({ err: signInError }, 'Registro: fallo al iniciar sesión tras crear el usuario');
      throw new AppError(500, 'INTERNAL_ERROR', 'La cuenta se creó, pero no se pudo iniciar sesión.');
    }

    const user = await buildUserResponse(
      userClient(signIn.session.access_token),
      signIn.user.id,
      signIn.user.email ?? invitation.email,
    );

    return { session: signIn.session, user };
  } catch (error) {
    // Si el usuario no llegó a crearse, la invitación vuelve a quedar disponible.
    if (createdUserId === null) {
      await releaseInvitation(invitation.id).catch(() => undefined);
    }
    throw error;
  }
};

/* ------------------------------------------------------------------ */
/* Login / refresh / logout                                            */
/* ------------------------------------------------------------------ */

export const login = async (input: LoginInput): Promise<AuthResult> => {
  if (emailFailureTracker.isBlocked(input.email)) {
    throw new AppError(429, 'RATE_LIMITED', 'Demasiados intentos fallidos. Espera unos minutos.', {
      retryAfterSeconds: config.LOGIN_WINDOW_MINUTES * 60,
    });
  }

  const { data, error } = await anon().auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session || !data.user) {
    if (isRateLimit(error)) {
      throw new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Inténtalo más tarde.', {
        retryAfterSeconds: 60,
      });
    }
    if (error?.code === 'email_not_confirmed') {
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirma tu correo antes de iniciar sesión.');
    }

    emailFailureTracker.recordFailure(input.email);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'El correo o la contraseña no son correctos.');
  }

  if (!data.user.email_confirmed_at) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirma tu correo antes de iniciar sesión.');
  }

  emailFailureTracker.reset(input.email);

  const user = await buildUserResponse(
    userClient(data.session.access_token),
    data.user.id,
    data.user.email ?? input.email,
  );

  return { session: data.session, user };
};

// Evita que dos pestañas renueven el mismo refresh token a la vez y disparen
// la detección de reutilización de Supabase.
const inflightRefreshes = new Map<string, Promise<Session>>();

export const refreshAccessToken = async (refreshToken: string): Promise<Session> => {
  const running = inflightRefreshes.get(refreshToken);
  if (running) return running;

  const job = (async (): Promise<Session> => {
    const { data, error } = await anon().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw new AppError(401, 'REFRESH_INVALID', 'La sesión ha caducado. Vuelve a iniciar sesión.');
    }
    return data.session;
  })();

  inflightRefreshes.set(refreshToken, job);
  try {
    return await job;
  } finally {
    inflightRefreshes.delete(refreshToken);
  }
};

export const revokeSession = async (
  accessToken: string | undefined,
  refreshToken: string | undefined,
): Promise<void> => {
  if (!accessToken) return;

  try {
    const response = await fetch(`${config.SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'Logout: Supabase devolvió un error');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Logout: no se pudo contactar con Supabase');
  }
};

/* ------------------------------------------------------------------ */
/* Contraseñas                                                         */
/* ------------------------------------------------------------------ */

const updatePasswordWithToken = async (
  accessToken: string,
  password: string,
  invalidCode: 'RESET_TOKEN_INVALID' | 'UNAUTHENTICATED',
): Promise<void> => {
  const response = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        401,
        invalidCode,
        invalidCode === 'RESET_TOKEN_INVALID'
          ? 'El enlace de recuperación no es válido o ha caducado.'
          : 'La sesión no es válida o ha caducado.',
      );
    }
    logger.error({ status: response.status }, 'No se pudo actualizar la contraseña');
    throw new AppError(500, 'INTERNAL_ERROR', 'No se pudo actualizar la contraseña.');
  }
};

const resolveEmail = async (userId: string, email: string | null): Promise<string> => {
  if (email) return email;
  const { data, error } = await admin().auth.admin.getUserById(userId);
  if (error || !data.user?.email) {
    throw new AppError(500, 'INTERNAL_ERROR', 'No se pudo obtener el correo del usuario.');
  }
  return data.user.email;
};

export const changePassword = async (
  userId: string,
  email: string | null,
  accessToken: string,
  input: ChangePasswordInput,
): Promise<void> => {
  const confirmedEmail = await resolveEmail(userId, email);
  assertPasswordStrength(input.new_password, confirmedEmail);

  const { data, error } = await anon().auth.signInWithPassword({
    email: confirmedEmail,
    password: input.current_password,
  });

  if (error || !data.session) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'La contraseña actual no es correcta.');
  }

  await updatePasswordWithToken(accessToken, input.new_password, 'UNAUTHENTICATED');
  // La sesión abierta solo para comprobar la contraseña ya no es necesaria.
  await revokeSession(data.session.access_token, data.session.refresh_token);
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await anon().auth.resetPasswordForEmail(email, {
    redirectTo: `${config.APP_ORIGIN}/restablecer`,
  });

  // No se revela si el correo existe ni si el SMTP falló.
  if (error) {
    logger.warn({ code: error.code }, 'Recuperación de contraseña: Supabase devolvió un error');
  }
};

export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  assertPasswordStrength(input.new_password);
  await updatePasswordWithToken(input.access_token, input.new_password, 'RESET_TOKEN_INVALID');
  await revokeSession(input.access_token, input.refresh_token);
};
