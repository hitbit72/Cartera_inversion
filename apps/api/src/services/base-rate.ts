import type { Currency, ProfileRow } from '@cartera/shared';
import { D, type Decimal } from '../lib/decimal.js';
import { logger } from '../lib/logger.js';
import { marketService, type MarketService } from './market/service.js';

/**
 * EUR por 1 unidad de la divisa base en una fecha concreta.
 * Si el proveedor falla y no hay caché, se usa 1 para no romper la vista.
 */
export const baseRateOn = async (
  profile: ProfileRow,
  date: string,
  market: MarketService = marketService,
): Promise<Decimal> => {
  if (profile.base_currency === 'EUR') return D(1);
  try {
    const snapshot = await market.eurRate(profile.base_currency, date);
    return snapshot.rate;
  } catch (error) {
    logger.debug({ err: error, date }, 'Sin tipo de cambio para la divisa base');
    return D(1);
  }
};

/** Serie con arrastre del último valor conocido, para listados. */
export const baseRateSeries = async (
  profile: ProfileRow,
  from: string,
  to: string,
  market: MarketService = marketService,
): Promise<(date: string) => Decimal> => {
  if (profile.base_currency === 'EUR') return () => D(1);

  try {
    const series = await market.rateSeries([profile.base_currency as Currency], from, to);
    const map = series.get(profile.base_currency) ?? new Map<string, Decimal>();
    const dates = Array.from(map.keys()).sort();

    return (date: string): Decimal => {
      let value: Decimal | null = null;
      for (const current of dates) {
        if (current > date) break;
        value = map.get(current)!;
      }
      if (value) return value;
      return dates.length > 0 ? map.get(dates[0]!)! : D(1);
    };
  } catch (error) {
    logger.debug({ err: error }, 'Sin serie de la divisa base');
    return () => D(1);
  }
};
