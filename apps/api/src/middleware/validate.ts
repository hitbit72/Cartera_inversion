import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { validationError, type FieldError } from '../lib/errors.js';

const toFieldErrors = (
  issues: ReadonlyArray<{ readonly path: readonly PropertyKey[]; readonly message: string }>,
): FieldError[] =>
  issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.map((segment) => String(segment)).join('.') : '(cuerpo)',
    message: issue.message,
  }));

export const validateBody = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    next(validationError(toFieldErrors(result.error.issues)));
    return;
  }
  req.validatedBody = result.data;
  next();
};

export const validateQuery = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    next(validationError(toFieldErrors(result.error.issues)));
    return;
  }
  req.validatedQuery = result.data;
  next();
};

export const validateParams = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req.params ?? {});
  if (!result.success) {
    next(validationError(toFieldErrors(result.error.issues)));
    return;
  }
  req.validatedParams = result.data;
  next();
};
