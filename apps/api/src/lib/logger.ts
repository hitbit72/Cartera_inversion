import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'new_password',
      'current_password',
      'token',
      'access_token',
      'refresh_token',
    ],
    censor: '[redacted]',
  },
});
