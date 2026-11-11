import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';

const app = createApp();
const server = createServer(app);

server.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, origin: config.APP_ORIGIN },
    'API de cartera escuchando',
  );
});

let shuttingDown = false;

const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Cerrando el servidor');

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Error al cerrar el servidor');
      process.exit(1);
    }
    process.exit(0);
  });

  // Las conexiones keep-alive abiertas no deben bloquear el cierre.
  setTimeout(() => {
    logger.warn('Cierre forzado tras 10 s');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesa rechazada sin manejar');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Excepción no controlada');
  shutdown('uncaughtException');
});
