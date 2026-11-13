import type { AssetType, Currency, Instrument } from '@cartera/shared';
import { CURRENCIES } from '@cartera/shared';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

export interface QuoteData {
  symbol: string;
  price: string;
  currency: Currency;
  as_of: string;
}

export interface HistoryData {
  candles: Array<{ date: string; close: string; adjusted_close?: string }>;
  currency: Currency;
}

export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<QuoteData | null>;
  getDailyHistory(symbol: string, from: string, to: string): Promise<HistoryData>;
  searchInstruments(query: string): Promise<Instrument[]>;
}

export interface FxProvider {
  readonly name: string;
  /** Tipos EUR→quote (unidades de quote por 1 EUR). */
  getRates(date: string, currencies: Currency[]): Promise<{ date: string; rates: Map<Currency, string> }>;
  getRateSeries(
    from: string,
    to: string,
    currencies: Currency[],
  ): Promise<Map<Currency, Map<string, string>>>;
}

export const isCurrency = (value: string): value is Currency =>
  (CURRENCIES as readonly string[]).includes(value);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Reintentos con retroceso exponencial; 3 intentos en total. */
export const withRetry = async <T>(operation: () => Promise<T>, attempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(300 * 2 ** attempt);
    }
  }
  throw lastError;
};

/** Cortacircuitos sencillo: 5 fallos en 60 s abren 5 minutos. */
export class CircuitBreaker {
  private failures: number[] = [];
  private openUntil = 0;

  canRequest(): boolean {
    return Date.now() >= this.openUntil;
  }

  recordSuccess(): void {
    this.failures = [];
    this.openUntil = 0;
  }

  recordFailure(): void {
    const now = Date.now();
    this.failures = this.failures.filter((timestamp) => now - timestamp < 60_000);
    this.failures.push(now);
    if (this.failures.length >= 5) {
      this.openUntil = now + 5 * 60_000;
      this.failures = [];
      logger.warn('Cortacircuitos abierto para el proveedor de mercado durante 5 minutos');
    }
  }
}

const yahooHeaders = (): Record<string, string> => ({
  'User-Agent': config.MARKET_USER_AGENT,
  Accept: 'application/json',
});

const toIsoDateFromEpoch = (epochSeconds: number): string =>
  new Date(epochSeconds * 1000).toISOString().slice(0, 10);

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly name = 'yahoo';
  private readonly breaker = new CircuitBreaker();

  private async fetchJson(url: string): Promise<YahooChartResponse> {
    const response = await fetch(url, {
      headers: yahooHeaders(),
      signal: AbortSignal.timeout(config.MARKET_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Yahoo respondió ${response.status}`);
    return (await response.json()) as YahooChartResponse;
  }

  async getQuote(symbol: string): Promise<QuoteData | null> {
    if (!this.breaker.canRequest()) throw new Error('Cortacircuitos abierto');

    try {
      const data = await withRetry(() =>
        this.fetchJson(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        ),
      );

      const result = data.chart?.result?.[0];
      if (!result) {
        this.breaker.recordSuccess();
        return null;
      }

      const meta = result.meta ?? {};
      const closes = result.indicators?.quote?.[0]?.close ?? [];
      const lastClose = [...closes].reverse().find((value): value is number => typeof value === 'number');
      const timestamps = result.timestamp ?? [];
      const lastTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined;

      const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : lastClose;
      if (typeof price !== 'number' || !Number.isFinite(price)) {
        this.breaker.recordSuccess();
        return null;
      }

      const asOfEpoch = meta.regularMarketTime ?? lastTimestamp;
      const asOf = asOfEpoch ? new Date(asOfEpoch * 1000).toISOString() : new Date().toISOString();

      this.breaker.recordSuccess();
      return {
        symbol,
        price: String(price),
        currency: isCurrency(meta.currency ?? '') ? (meta.currency as Currency) : 'USD',
        as_of: asOf,
      };
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }

  async getDailyHistory(symbol: string, from: string, to: string): Promise<HistoryData> {
    if (!this.breaker.canRequest()) throw new Error('Cortacircuitos abierto');

    try {
      const period1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
      const period2 = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000);
      const data = await withRetry(() =>
        this.fetchJson(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits`,
        ),
      );

      const result = data.chart?.result?.[0];
      if (!result) {
        this.breaker.recordSuccess();
        return { candles: [], currency: 'USD' };
      }

      const timestamps = result.timestamp ?? [];
      const closes = result.indicators?.quote?.[0]?.close ?? [];
      const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
      const candles: HistoryData['candles'] = [];

      for (let index = 0; index < timestamps.length; index += 1) {
        const close = closes[index];
        if (typeof close !== 'number' || !Number.isFinite(close)) continue;
        const adjustedClose = adjusted[index];
        candles.push({
          date: toIsoDateFromEpoch(timestamps[index]!),
          close: String(close),
          ...(typeof adjustedClose === 'number' && Number.isFinite(adjustedClose)
            ? { adjusted_close: String(adjustedClose) }
            : {}),
        });
      }

      const currency = isCurrency(result.meta?.currency ?? '')
        ? (result.meta!.currency as Currency)
        : 'USD';

      this.breaker.recordSuccess();
      return { candles, currency };
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }

  async searchInstruments(query: string): Promise<Instrument[]> {
    if (!this.breaker.canRequest()) throw new Error('Cortacircuitos abierto');

    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0`,
        { headers: yahooHeaders(), signal: AbortSignal.timeout(config.MARKET_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`Yahoo respondió ${response.status}`);

      const data = (await response.json()) as {
        quotes?: Array<{
          symbol?: string;
          shortname?: string;
          longname?: string;
          quoteType?: string;
          currency?: string;
          exchange?: string;
          exchDisp?: string;
          sector?: string;
          sectorDisp?: string;
        }>;
      };

      const typeMap: Record<string, AssetType> = {
        EQUITY: 'STOCK',
        CRYPTO: 'CRYPTO',
        ETF: 'ETF',
        MUTUALFUND: 'FUND',
        BOND: 'BOND',
      };

      this.breaker.recordSuccess();

      return (data.quotes ?? [])
        .filter((quote) => typeof quote.symbol === 'string' && quote.symbol.length > 0)
        .map((quote) => ({
          symbol: quote.symbol!.toUpperCase(),
          name: quote.longname ?? quote.shortname ?? quote.symbol!,
          exchange: quote.exchDisp ?? quote.exchange ?? null,
          asset_type: typeMap[quote.quoteType ?? ''] ?? 'STOCK',
          currency: isCurrency(quote.currency ?? '') ? (quote.currency as Currency) : 'USD',
          sector: quote.sectorDisp ?? quote.sector ?? null,
        }));
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }
}

interface FrankfurterLatest {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

interface FrankfurterSeries {
  base?: string;
  start_date?: string;
  end_date?: string;
  rates?: Record<string, Record<string, number>>;
}

export class FrankfurterFxProvider implements FxProvider {
  readonly name = 'frankfurter';
  private readonly breaker = new CircuitBreaker();

  private async settle<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.breaker.canRequest()) throw new Error('Cortacircuitos abierto');
    try {
      const result = await withRetry(operation);
      this.breaker.recordSuccess();
      return result;
    } catch (error) {
      this.breaker.recordFailure();
      throw error;
    }
  }

  async getRates(date: string, currencies: Currency[]): Promise<{ date: string; rates: Map<Currency, string> }> {
    const targets = currencies.filter((currency) => currency !== 'EUR');
    if (targets.length === 0) return { date, rates: new Map() };

    const today = new Date().toISOString().slice(0, 10);
    const endpoint = date >= today ? 'latest' : date;
    const url = `https://api.frankfurter.app/${endpoint}?from=EUR&to=${targets.join(',')}`;

    return this.settle(async () => {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(config.MARKET_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Frankfurter respondió ${response.status}`);
      const data = (await response.json()) as FrankfurterLatest;

      const rates = new Map<Currency, string>();
      for (const [currency, value] of Object.entries(data.rates ?? {})) {
        if (isCurrency(currency) && typeof value === 'number' && Number.isFinite(value) && value > 0) {
          rates.set(currency, String(value));
        }
      }
      return { date: data.date ?? date, rates };
    });
  }

  async getRateSeries(
    from: string,
    to: string,
    currencies: Currency[],
  ): Promise<Map<Currency, Map<string, string>>> {
    const targets = currencies.filter((currency) => currency !== 'EUR');
    if (targets.length === 0) return new Map();

    return this.settle(async () => {
      const response = await fetch(
        `https://api.frankfurter.app/${from}..${to}?from=EUR&to=${targets.join(',')}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(config.MARKET_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`Frankfurter respondió ${response.status}`);
      const data = (await response.json()) as FrankfurterSeries;

      const result = new Map<Currency, Map<string, string>>();
      for (const [date, rates] of Object.entries(data.rates ?? {})) {
        for (const [currency, value] of Object.entries(rates)) {
          if (!isCurrency(currency) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
            continue;
          }
          const series = result.get(currency) ?? new Map<string, string>();
          series.set(date, String(value));
          result.set(currency, series);
        }
      }
      return result;
    });
  }
}
