import type { Candle, Currency, Instrument, MarketWarning, Quote } from '@cartera/shared';
import { CURRENCIES } from '@cartera/shared';
import { config } from '../../config.js';
import { addDays, todayIso } from '../../lib/dates.js';
import { D, ZERO, type Decimal } from '../../lib/decimal.js';
import { logger } from '../../lib/logger.js';
import { admin } from '../../lib/supabase.js';
import {
  FrankfurterFxProvider,
  YahooMarketDataProvider,
  type FxProvider,
  type MarketDataProvider,
} from './providers.js';

export interface FxSnapshot {
  /** EUR por 1 unidad de la divisa. */
  rate: Decimal;
  date: string;
  source: string;
  stale: boolean;
}

export interface FxTableSnapshot {
  rates: Map<Currency, Decimal>;
  date: string;
  source: string;
  stale: boolean;
}

const uniqueCurrencies = (currencies: Currency[]): Currency[] =>
  Array.from(new Set(currencies));

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index]!);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
};

interface MarketPriceRow {
  symbol: string;
  price_date: string;
  close_price: string;
  currency: Currency;
  source: string;
  fetched_at: string;
}

interface FxRateRow {
  base_currency: 'EUR';
  quote_currency: Currency;
  rate_date: string;
  rate: string;
  source: string;
  fetched_at: string;
}

export class MarketService {
  constructor(
    private readonly market: MarketDataProvider = new YahooMarketDataProvider(),
    private readonly fx: FxProvider = new FrankfurterFxProvider(),
  ) {}

  private get db() {
    return admin();
  }

  private async latestCachedPrice(symbol: string): Promise<MarketPriceRow | null> {
    const { data, error } = await this.db
      .from('market_prices')
      .select('*')
      .eq('symbol', symbol)
      .order('price_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn({ err: error, symbol }, 'No se pudo leer la caché de precios');
      return null;
    }
    return (data as MarketPriceRow | null) ?? null;
  }

  private async storePrice(symbol: string, price: string, currency: Currency, date: string, source: string): Promise<void> {
    const { error } = await this.db.from('market_prices').upsert(
      {
        symbol,
        price_date: date,
        close_price: price,
        currency,
        source,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'symbol,price_date' },
    );
    if (error) logger.warn({ err: error, symbol }, 'No se pudo guardar el precio en caché');
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const cached = await this.latestCachedPrice(symbol);

    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < config.MARKET_CACHE_QUOTE_MINUTES * 60_000 && cached.price_date >= addDays(todayIso(), -4)) {
        return {
          symbol,
          price: cached.close_price,
          currency: cached.currency,
          as_of: `${cached.price_date}T00:00:00Z`,
          source: cached.source === 'manual' ? 'manual' : 'yahoo',
          stale: false,
        };
      }
    }

    try {
      const fresh = await this.market.getQuote(symbol);
      if (fresh) {
        const priceDate = fresh.as_of.slice(0, 10);
        await this.storePrice(symbol, fresh.price, fresh.currency, priceDate, this.market.name);
        return {
          symbol,
          price: fresh.price,
          currency: fresh.currency,
          as_of: fresh.as_of,
          source: this.market.name === 'yahoo' ? 'yahoo' : 'manual',
          stale: false,
        };
      }
    } catch (error) {
      logger.debug({ err: error, symbol }, 'Proveedor de precios no disponible; se usa caché');
    }

    if (!cached) return null;

    return {
      symbol,
      price: cached.close_price,
      currency: cached.currency,
      as_of: `${cached.price_date}T00:00:00Z`,
      source: cached.source === 'manual' ? 'manual' : 'yahoo',
      stale: true,
    };
  }

  async getQuotes(symbols: string[]): Promise<{ quotes: Map<string, Quote>; warnings: MarketWarning[] }> {
    const unique = Array.from(new Set(symbols.map((symbol) => symbol.toUpperCase())));
    const results = await mapLimit(unique, 4, (symbol) => this.getQuote(symbol));

    const quotes = new Map<string, Quote>();
    const warnings: MarketWarning[] = [];

    results.forEach((quote, index) => {
      const symbol = unique[index]!;
      if (!quote) {
        warnings.push({ code: 'PRICE_MISSING', symbol });
        return;
      }
      quotes.set(symbol, quote);
      if (quote.stale) {
        warnings.push({ code: 'PRICE_STALE', symbol, as_of: quote.as_of.slice(0, 10) });
      }
    });

    return { quotes, warnings };
  }

  async getHistory(
    symbol: string,
    from: string,
    to: string,
  ): Promise<{ candles: Candle[]; currency: Currency; stale: boolean }> {
    try {
      const fresh = await this.market.getDailyHistory(symbol, from, to);
      if (fresh.candles.length > 0) {
        const rows = fresh.candles.map((candle) => ({
          symbol,
          price_date: candle.date,
          close_price: candle.close,
          currency: fresh.currency,
          source: this.market.name,
          fetched_at: new Date().toISOString(),
        }));

        const { error } = await this.db
          .from('market_prices')
          .upsert(rows, { onConflict: 'symbol,price_date' });
        if (error) logger.warn({ err: error, symbol }, 'No se pudo guardar el histórico');

        return { candles: fresh.candles, currency: fresh.currency, stale: false };
      }
    } catch (error) {
      logger.debug({ err: error, symbol }, 'Histórico no disponible en el proveedor; se usa caché');
    }

    const { data, error } = await this.db
      .from('market_prices')
      .select('*')
      .eq('symbol', symbol)
      .gte('price_date', from)
      .lte('price_date', to)
      .order('price_date', { ascending: true });

    if (error) {
      logger.warn({ err: error, symbol }, 'No se pudo leer el histórico en caché');
      return { candles: [], currency: 'USD', stale: true };
    }

    const rows = (data ?? []) as MarketPriceRow[];
    return {
      candles: rows.map((row) => ({ date: row.price_date, close: row.close_price })),
      currency: rows[0]?.currency ?? 'USD',
      stale: true,
    };
  }

  private async cachedFxRows(currencies: Currency[], from: string | null, to: string): Promise<FxRateRow[]> {
    let query = this.db
      .from('fx_rates')
      .select('*')
      .in('quote_currency', currencies)
      .lte('rate_date', to);

    if (from) query = query.gte('rate_date', from);

    const { data, error } = await query.order('rate_date', { ascending: false });
    if (error) {
      logger.warn({ err: error }, 'No se pudo leer la caché de divisas');
      return [];
    }
    return (data ?? []) as FxRateRow[];
  }

  private async storeFxRates(
    rates: Map<Currency, string>,
    date: string,
    source: string,
  ): Promise<void> {
    const rows = Array.from(rates.entries()).map(([currency, value]) => ({
      base_currency: 'EUR' as const,
      quote_currency: currency,
      rate_date: date,
      rate: value,
      source,
      fetched_at: new Date().toISOString(),
    }));

    if (rows.length === 0) return;

    const { error } = await this.db
      .from('fx_rates')
      .upsert(rows, { onConflict: 'base_currency,quote_currency,rate_date' });
    if (error) logger.warn({ err: error }, 'No se pudieron guardar los tipos de cambio');
  }

  /** Tipos actuales EUR→X para varias divisas, con caché y respaldo. */
  async currentRates(currencies: Currency[], date = todayIso()): Promise<FxTableSnapshot> {
    const targets = uniqueCurrencies(currencies).filter((currency) => currency !== 'EUR');
    const rates = new Map<Currency, Decimal>();
    rates.set('EUR', D(1));

    if (targets.length === 0) {
      return { rates, date, source: 'frankfurter', stale: false };
    }

    const cached = await this.cachedFxRows(targets, null, date);
    const latestByCurrency = new Map<Currency, FxRateRow>();
    for (const row of cached) {
      if (!latestByCurrency.has(row.quote_currency)) latestByCurrency.set(row.quote_currency, row);
    }

    const isFresh = (row: FxRateRow | undefined): boolean =>
      row !== undefined && row.rate_date >= addDays(date, -6);

    if (targets.every((currency) => isFresh(latestByCurrency.get(currency)))) {
      for (const currency of targets) {
        const row = latestByCurrency.get(currency)!;
        rates.set(currency, D(1).div(D(row.rate)));
      }
      return { rates, date, source: 'frankfurter', stale: false };
    }

    try {
      const fresh = await this.fx.getRates(date, targets);
      await this.storeFxRates(fresh.rates, fresh.date, this.fx.name);

      for (const currency of targets) {
        const value = fresh.rates.get(currency);
        if (value) rates.set(currency, D(1).div(D(value)));
        else {
          const row = latestByCurrency.get(currency);
          if (row) rates.set(currency, D(1).div(D(row.rate)));
        }
      }

      return { rates, date: fresh.date, source: this.fx.name, stale: false };
    } catch (error) {
      logger.debug({ err: error }, 'Proveedor de divisas no disponible; se usa caché');

      let stale = false;
      for (const currency of targets) {
        const row = latestByCurrency.get(currency);
        if (row) {
          rates.set(currency, D(1).div(D(row.rate)));
          stale = true;
        } else {
          rates.set(currency, D(1));
          stale = true;
        }
      }

      return { rates, date, source: 'frankfurter', stale };
    }
  }

  /** EUR por 1 unidad para una fecha concreta (snapshot de operaciones). */
  async eurRate(currency: Currency, date: string): Promise<FxSnapshot> {
    if (currency === 'EUR') return { rate: D(1), date, source: 'frankfurter', stale: false };

    const cached = await this.cachedFxRows([currency], null, date);
    const exact = cached.find((row) => row.rate_date === date) ?? cached[0];

    if (exact && exact.rate_date >= addDays(date, -6)) {
      return {
        rate: D(1).div(D(exact.rate)),
        date: exact.rate_date,
        source: exact.source,
        stale: false,
      };
    }

    try {
      const fresh = await this.fx.getRates(date, [currency]);
      const value = fresh.rates.get(currency);
      if (!value) throw new Error('Divisa sin dato');

      await this.storeFxRates(fresh.rates, fresh.date, this.fx.name);
      return {
        rate: D(1).div(D(value)),
        date: fresh.date,
        source: this.fx.name,
        stale: false,
      };
    } catch (error) {
      logger.debug({ err: error, currency, date }, 'Tipo de cambio no disponible; se usa caché');
      if (exact) {
        return {
          rate: D(1).div(D(exact.rate)),
          date: exact.rate_date,
          source: exact.source,
          stale: true,
        };
      }
      throw error;
    }
  }

  /**
   * Serie diaria de EUR por unidad de cada divisa. Se usa para valorar
   * el histórico de la cartera y el benchmark.
   */
  async rateSeries(
    currencies: Currency[],
    from: string,
    to: string,
  ): Promise<Map<Currency, Map<string, Decimal>>> {
    const targets = uniqueCurrencies(currencies).filter((currency) => currency !== 'EUR');
    const result = new Map<Currency, Map<string, Decimal>>();
    result.set('EUR', new Map());

    if (targets.length === 0) return result;

    const cached = await this.cachedFxRows(targets, from, to);
    const grouped = new Map<Currency, Map<string, Decimal>>();
    for (const row of cached) {
      const series = grouped.get(row.quote_currency) ?? new Map<string, Decimal>();
      series.set(row.rate_date, D(1).div(D(row.rate)));
      grouped.set(row.quote_currency, series);
    }

    const covered = targets.every((currency) => {
      const series = grouped.get(currency);
      if (!series || series.size === 0) return false;
      const latest = Array.from(series.keys()).sort().at(-1)!;
      return latest >= addDays(to, -7);
    });

    if (!covered) {
      try {
        const fresh = await this.fx.getRateSeries(from, to, targets);
        for (const [currency, series] of fresh) {
          if (currency === 'EUR') continue;
          const target = grouped.get(currency) ?? new Map<string, Decimal>();
          const rows = new Map<Currency, string>();
          for (const [date, value] of series) {
            target.set(date, D(1).div(D(value)));
            rows.set(currency, value);
          }
          grouped.set(currency, target);
          // Guardado por fecha: agrupa por fecha para el upsert.
          const byDate = new Map<string, Map<Currency, string>>();
          for (const [date, value] of series) {
            const bucket = byDate.get(date) ?? new Map<Currency, string>();
            bucket.set(currency, value);
            byDate.set(date, bucket);
          }
          await Promise.all(
            Array.from(byDate.entries()).map(([date, rates]) => this.storeFxRates(rates, date, this.fx.name)),
          );
        }
      } catch (error) {
        logger.debug({ err: error }, 'Serie de divisas no disponible; se usa caché');
      }
    }

    for (const currency of targets) {
      result.set(currency, grouped.get(currency) ?? new Map());
    }
    return result;
  }

  async searchInstruments(query: string): Promise<Instrument[]> {
    try {
      return await this.market.searchInstruments(query);
    } catch (error) {
      logger.debug({ err: error, query }, 'Búsqueda de instrumentos no disponible');
      return [];
    }
  }
}

export const marketService = new MarketService();
export const ALL_CURRENCIES = CURRENCIES;
