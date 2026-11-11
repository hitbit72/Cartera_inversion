import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from '../config.js';
import { AppError, badRequest, isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { problemFor } from '../lib/problem.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'El recurso no existe.'));
};

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  let appError: AppError;

  if (isAppError(error)) {
    appError = error;
  } else {
    const bodyError = error as BodyParserError;
    if (bodyError.type === 'entity.too.large' || bodyError.status === 413) {
      appError = new AppError(413, 'BAD_REQUEST', 'El cuerpo de la petición es demasiado grande.');
    } else if (bodyError instanceof SyntaxError && bodyError.status === 400) {
      appError = badRequest('El cuerpo JSON no es válido.');
    } else {
      appError = new AppError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error interno.');
    }
  }

  if (appError.status >= 500) {
    logger.error(
      { err: error, requestId: req.requestId, method: req.method, url: req.originalUrl },
      'Error de servidor',
    );
  } else if (!config.isTest) {
    logger.warn(
      { code: appError.code, status: appError.status, requestId: req.requestId },
      appError.message,
    );
  }

  if (appError.retryAfterSeconds) {
    res.setHeader('Retry-After', String(appError.retryAfterSeconds));
  }

  res
    .status(appError.status)
    .type('application/problem+json')
    .json(problemFor(req, appError));
};
