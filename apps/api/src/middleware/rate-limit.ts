import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { problemFor } from '../lib/problem.js';

const handler = (
  req: Request,
  res: Response,
  _next: unknown,
  options: { windowMs: number },
): void => {
  const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
  const error = new AppError(429, 'RATE_LIMITED', 'Demasiadas peticiones. Inténtalo más tarde.', {
    retryAfterSeconds,
  });
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).type('application/problem+json').json(problemFor(req, error));
};

const skip = (): boolean => config.isTest;

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'anonymous',
});

export const loginLimiter = rateLimit({
  windowMs: config.LOGIN_WINDOW_MINUTES * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
  keyGenerator: (req) => req.ip ?? 'anonymous',
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
  keyGenerator: (req) => req.ip ?? 'anonymous',
});

export const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
  keyGenerator: (req) => req.ip ?? 'anonymous',
});

export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
  keyGenerator: (req) => req.ip ?? 'anonymous',
});

export const marketRefreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'anonymous',
});

/**
 * Límite de fallos de login por email, independiente de la IP.
 * En memoria: válido para un servidor de una sola instancia (el caso previsto).
 */
class EmailFailureTracker {
  private readonly attempts = new Map<string, number[]>();

  private windowMs(): number {
    return config.LOGIN_WINDOW_MINUTES * 60 * 1000;
  }

  private recent(email: string, now: number): number[] {
    const cutoff = now - this.windowMs();
    const list = (this.attempts.get(email) ?? []).filter((timestamp) => timestamp > cutoff);
    if (list.length === 0) this.attempts.delete(email);
    else this.attempts.set(email, list);
    return list;
  }

  isBlocked(email: string): boolean {
    return this.recent(email.toLowerCase(), Date.now()).length >= config.LOGIN_MAX_FAILURES_PER_EMAIL;
  }

  recordFailure(email: string): void {
    const key = email.toLowerCase();
    const now = Date.now();
    const list = this.recent(key, now);
    list.push(now);
    this.attempts.set(key, list);
  }

  reset(email: string): void {
    this.attempts.delete(email.toLowerCase());
  }
}

export const emailFailureTracker = new EmailFailureTracker();
