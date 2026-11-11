import type { PostgrestError } from '@supabase/supabase-js';
import { AppError } from './errors.js';
import { logger } from './logger.js';

export const isPostgrestError = (error: unknown): error is PostgrestError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  'message' in error &&
  typeof (error as { code: unknown }).code === 'string';

export const pgCode = (error: unknown): string | undefined =>
  isPostgrestError(error) ? error.code : undefined;

/** Error de base de datos no esperado: se registra y se devuelve 500 genérico. */
export const dbFail = (error: unknown, context: string): never => {
  logger.error({ err: error, context }, 'Error de base de datos');
  throw new AppError(500, 'INTERNAL_ERROR', 'No se pudo completar la operación.');
};
