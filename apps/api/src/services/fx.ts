import type { Currency } from '@cartera/shared';
import { AppError } from '../lib/errors.js';
import { D, type Decimal } from '../lib/decimal.js';
import { marketService, type MarketService } from './market/service.js';

export interface FxResolution {
  rate: Decimal;
  date: string;
  source: 'AUTO' | 'MANUAL';
}

/**
 * Snapshot de cambio a EUR. Si el usuario envía `fx_rate_eur` se marca como
 * MANUAL; en caso contrario se consulta el proveedor (o la caché).
 */
export const resolveFx = async (
  currency: Currency,
  tradeDate: string,
  manualRate: string | undefined,
  market: MarketService = marketService,
): Promise<FxResolution> => {
  if (manualRate !== undefined) {
    return { rate: D(manualRate), date: tradeDate, source: 'MANUAL' };
  }

  if (currency === 'EUR') {
    return { rate: D(1), date: tradeDate, source: 'AUTO' };
  }

  try {
    const snapshot = await market.eurRate(currency, tradeDate);
    // Un tipo de cambio no puede ser posterior a la fecha de la operación.
    return {
      rate: snapshot.rate,
      date: snapshot.date <= tradeDate ? snapshot.date : tradeDate,
      source: 'AUTO',
    };
  } catch {
    throw new AppError(
      503,
      'MARKET_DATA_UNAVAILABLE',
      'No se pudo obtener el tipo de cambio. Introduce uno manual o inténtalo más tarde.',
    );
  }
};
