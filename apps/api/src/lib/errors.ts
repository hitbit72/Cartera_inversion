import type { ApiErrorCode } from '@cartera/shared';

export interface FieldError {
  field: string;
  message: string;
}

const TITLES: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'Petición incorrecta',
  UNAUTHENTICATED: 'No autenticado',
  INVALID_CREDENTIALS: 'Credenciales incorrectas',
  REFRESH_INVALID: 'Sesión caducada',
  INVITATION_INVALID: 'Invitación no válida',
  INVITATION_USED: 'Invitación ya utilizada',
  INVITATION_EXPIRED: 'Invitación caducada',
  RESET_TOKEN_INVALID: 'Enlace de recuperación no válido',
  EMAIL_NOT_VERIFIED: 'Correo sin verificar',
  FORBIDDEN: 'Acceso denegado',
  NOT_FOUND: 'Recurso no encontrado',
  EMAIL_EXISTS: 'El correo ya está registrado',
  DUPLICATE_ASSET: 'Activo duplicado',
  ASSET_IN_USE: 'Activo en uso',
  INCONSISTENT_HISTORY: 'Histórico inconsistente',
  VALIDATION_ERROR: 'Datos no válidos',
  INSUFFICIENT_POSITION: 'Posición insuficiente',
  INVALID_WITHHOLDING: 'Retención no válida',
  RATE_LIMITED: 'Demasiados intentos',
  INTERNAL_ERROR: 'Error interno',
  MARKET_DATA_UNAVAILABLE: 'Datos de mercado no disponibles',
};

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly title: string;
  readonly errors?: FieldError[];
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: ApiErrorCode,
    detail: string,
    options: { errors?: FieldError[]; title?: string; retryAfterSeconds?: number } = {},
  ) {
    super(detail);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.title = options.title ?? TITLES[code];
    this.errors = options.errors;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const badRequest = (detail = 'La petición no se pudo interpretar.'): AppError =>
  new AppError(400, 'BAD_REQUEST', detail);

export const unauthenticated = (detail = 'Inicia sesión para continuar.'): AppError =>
  new AppError(401, 'UNAUTHENTICATED', detail);

export const forbidden = (detail = 'No tienes permiso para esta operación.'): AppError =>
  new AppError(403, 'FORBIDDEN', detail);

export const notFound = (detail = 'El recurso no existe.'): AppError =>
  new AppError(404, 'NOT_FOUND', detail);

export const validationError = (errors: FieldError[], detail = 'Revisa los campos marcados.'): AppError =>
  new AppError(422, 'VALIDATION_ERROR', detail, { errors });

export const conflict = (
  code: Extract<
    ApiErrorCode,
    'EMAIL_EXISTS' | 'DUPLICATE_ASSET' | 'ASSET_IN_USE' | 'INVITATION_USED' | 'INCONSISTENT_HISTORY'
  >,
  detail: string,
): AppError => new AppError(409, code, detail);

export const unprocessable = (
  code: Extract<ApiErrorCode, 'INSUFFICIENT_POSITION' | 'INVALID_WITHHOLDING' | 'INCONSISTENT_HISTORY'>,
  detail: string,
  errors?: FieldError[],
): AppError => new AppError(422, code, detail, { errors });
