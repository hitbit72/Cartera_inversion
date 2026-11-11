import { Router } from 'express';
import { admin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    const { error } = await admin()
      .from('fx_rates')
      .select('rate', { head: true, count: 'exact' })
      .limit(1);

    if (error) throw error;

    res.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    logger.warn({ err: error }, 'Comprobación de salud fallida');
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});
