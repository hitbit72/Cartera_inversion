import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { requestId } from './middleware/request-id.js';
import { assetsRouter } from './routes/assets.js';
import { authRouter } from './routes/auth.js';
import { dividendsRouter } from './routes/dividends.js';
import { healthRouter } from './routes/health.js';
import { marketRouter } from './routes/market.js';
import { portfolioRouter } from './routes/portfolio.js';
import { transactionsRouter } from './routes/transactions.js';

/**
 * Construye la aplicación Express sin abrir el puerto, de modo que las
 * pruebas puedan usarla con Supertest.
 */
export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  // Detrás de Nginx/Caddy: una sola capa de proxy para req.ip y rate limits.
  if (config.isProduction) app.set('trust proxy', 1);

  app.use(requestId);

  app.use(
    helmet({
      // La API solo devuelve JSON: la CSP pertenece al frontend.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    pinoHttp({
      logger,
      quietReqLogger: true,
      customProps: (req) => ({ requestId: (req as { requestId?: string }).requestId }),
    }),
  );

  app.use(cookieParser());

  // Antes del parser JSON: rechaza orígenes ajenos y cuerpos no JSON.
  app.use(csrfProtection);
  app.use(express.json({ limit: '100kb', type: ['application/json', 'application/*+json'] }));

  app.use(generalLimiter);

  // Disponibilidad fuera del prefijo versionado.
  app.use(healthRouter);

  app.use(`${config.apiPrefix}/auth`, authRouter);
  app.use(`${config.apiPrefix}/assets`, assetsRouter);
  app.use(`${config.apiPrefix}/transactions`, transactionsRouter);
  app.use(`${config.apiPrefix}/dividends`, dividendsRouter);
  app.use(`${config.apiPrefix}/portfolio`, portfolioRouter);
  app.use(`${config.apiPrefix}/market`, marketRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
