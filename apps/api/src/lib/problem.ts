import type { ApiProblem } from '@cartera/shared';
import type { Request } from 'express';
import { config } from '../config.js';
import type { AppError } from './errors.js';

export const problemFor = (req: Request, error: AppError): ApiProblem => {
  const problem: ApiProblem = {
    type: `${config.APP_ORIGIN}/errors/${error.code.toLowerCase().replaceAll('_', '-')}`,
    title: error.title,
    status: error.status,
    detail: error.message,
    instance: req.originalUrl,
    code: error.code,
  };

  if (error.errors && error.errors.length > 0) {
    problem.errors = error.errors;
  }

  return problem;
};
