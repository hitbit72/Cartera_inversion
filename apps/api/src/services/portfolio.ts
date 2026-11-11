import type {
  AllocationQuery,
  AllocationResponse,
  AssetRow,
  CostMethod,
  Currency,
  DividendRow,
  DividendsSummaryQuery,
  DividendSummaryResponse,
  HistoryQuery,
  HistoryPoint,
  MarketWarning,
  PerformanceQuery,
  PerformanceResponse,
  PortfolioHistoryResponse,
  PortfolioResponse,
  ProfileRow,
  TransactionRow,
} from '@cartera/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../lib/errors.js';
import { addDays, todayIso } from '../lib/dates.js';
import { D, ZERO, money, percent, type Decimal } from '../lib/decimal.js';
import { dbFail } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  buildHistory,
  type BenchmarkSeries,
} from './calculations/history.js';
import {
  computeAllocation,
  computePortfolio,
  computeLedgers,
  dedupeWarnings,
  dividendsNetEur,
  eurToBase,
  fxEurPerUnit,
  netInvestedEur,
  type FxTable,
  type PriceInfo,
} from './calculations/portfolio.js';
import { marketService, type MarketService } from './market/service.js';
import { xirr, twrPercent } from './calculations/performance.js';

interface PortfolioData {
  assets: AssetRow[];
  transactions: TransactionRow[];
  dividends: DividendRow[];
}

const loadPortfolioData = async (
  client: SupabaseClient,
  userId: string,
): Promise<PortfolioData> => {
  const [assetsResult, transactionsResult, dividendsResult] = await Promise.all([
    client.from('assets').select('*').eq('user_id', userId),
    client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    client
      .from('dividends')
      .select('*')
      .eq('user_id', userId)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true }),
  ]);

  if (assetsResult.error) dbFail(assetsResult.error, 'portfolio/assets');
  if (transactionsResult.error) dbFail(transactionsResult.error, 'portfolio/transactions');
  if (dividendsResult.error) dbFail(dividendsResult.error, 'portfolio/dividends');

  return {
    assets: (assetsResult.data ?? []) as AssetRow[],
    transactions: (transactionsResult.data ?? []) as TransactionRow[],
    dividends: (dividendsResult.data ?? []) as DividendRow[],
  };
};

const rateOf = (rates: Map<Currency, Decimal>, currency: Currency): Decimal => {
  if (currency === 'EUR') return D(1);
  return rates.get(currency) ?? D(1);
};

/** Convierte un precio de una divisa a otra usando EUR como pivote. */
const crossPrice = (
  price: Decimal,
  from: Currency,
  to: Currency,
  rates: Map<Currency, Decimal>,
): Decimal => {
  if (from === to) return price;
  const eur = price.mul(rateOf(rates, from));
  return eur.div(rateOf(rates, to));
};

const manualPriceInAssetCurrency = (
  asset: AssetRow,
  rates: Map<Currency, Decimal>,
): Decimal | null => {
  if (!asset.manual_price || !asset.manual_price_currency) return null;
  return crossPrice(D(asset.manual_price), asset.manual_price_currency, asset.currency, rates);
};

const forwardRate = (
  series: Map<string, Decimal> | undefined,
  day: string,
): Decimal => {
  if (!series || series.size === 0) return D(1);
  const dates = Array.from(series.keys()).sort();
  let value: Decimal | null = null;
  for (const date of dates) {
    if (date > day) break;
    value = series.get(date)!;
  }
  if (value) return value;
  return series.get(dates[0]!) ?? D(1);
};

export class PortfolioService {
  constructor(private readonly market: MarketService = marketService) {}

  private async currentFx(
    profile: ProfileRow,
    currencies: Currency[],
  ): Promise<FxTable> {
    const all = Array.from(new Set<Currency>([profile.base_currency, ...currencies, 'EUR']));
    const snapshot = await this.market.currentRates(all, todayIso());
    return {
      baseCurrency: profile.base_currency,
      baseRate: rateOf(snapshot.rates, profile.base_currency),
      rates: snapshot.rates,
      date: snapshot.date,
      source: snapshot.source,
      stale: snapshot.stale,
    };
  }

  private async resolvePrices(
    assets: AssetRow[],
    rates: Map<Currency, Decimal>,
  ): Promise<{ prices: Map<string, PriceInfo>; warnings: MarketWarning[] }> {
    const auto = assets.filter((asset) => asset.price_mode === 'AUTO');
    const { quotes, warnings } = await this.market.getQuotes(auto.map((asset) => asset.symbol));

    const prices = new Map<string, PriceInfo>();

    for (const asset of assets) {
      if (asset.price_mode === 'MANUAL') {
        const priceNative = manualPriceInAssetCurrency(asset, rates);
        prices.set(asset.id, {
          priceNative,
          currency: asset.currency,
          date: asset.manual_price_at?.slice(0, 10) ?? null,
          stale: false,
          source: 'manual',
        });
        continue;
      }

      const quote = quotes.get(asset.symbol);
      if (!quote) {
        prices.set(asset.id, {
          priceNative: null,
          currency: asset.currency,
          date: null,
          stale: true,
          source: 'yahoo',
        });
        continue;
      }

      prices.set(asset.id, {
        priceNative: crossPrice(D(quote.price), quote.currency, asset.currency, rates),
        currency: asset.currency,
        date: quote.as_of.slice(0, 10),
        stale: quote.stale,
        source: quote.source,
      });
    }

    return { prices, warnings };
  }

  async getPortfolio(
    client: SupabaseClient,
    profile: ProfileRow,
    includeClosed: boolean,
  ): Promise<PortfolioResponse> {
    const data = await loadPortfolioData(client, profile.id);
    const ledgers = computeLedgers(data.transactions, profile.cost_method);

    const processedIds = new Set<string>([
      ...data.transactions.map((tx) => tx.asset_id),
      ...data.dividends.map((dividend) => dividend.asset_id),
    ]);
    const involvedAssets = data.assets.filter((asset) => processedIds.has(asset.id));

    const currencies = new Set<Currency>([profile.base_currency]);
    for (const asset of involvedAssets) {
      currencies.add(asset.currency);
      if (asset.manual_price_currency) currencies.add(asset.manual_price_currency);
    }
    const fx = await this.currentFx(profile, Array.from(currencies));

    const { prices, warnings: priceWarnings } = await this.resolvePrices(involvedAssets, fx.rates);
    const result = computePortfolio({
      profile,
      assets: data.assets,
      transactions: data.transactions,
      dividends: data.dividends,
      ledgers,
      prices,
      fx,
      includeClosed,
    });

    const warnings = dedupeWarnings([...priceWarnings, ...result.warnings]);
    if (fx.stale) warnings.push({ code: 'FX_STALE', as_of: fx.date });

    return {
      base_currency: profile.base_currency,
      as_of: new Date().toISOString(),
      cost_method: profile.cost_method,
      fx: { date: fx.date, source: fx.source, stale: fx.stale },
      positions: result.positions,
      totals: result.totals,
      warnings: dedupeWarnings(warnings),
    };
  }

  private async buildHistory(
    client: SupabaseClient,
    profile: ProfileRow,
    from: string,
    to: string,
    interval: '1d' | '1w' | '1m',
    includeBenchmark: boolean,
  ): Promise<{
    series: HistoryPoint[];
    benchmark: PortfolioHistoryResponse['benchmark'];
    warnings: MarketWarning[];
  }> {
    const data = await loadPortfolioData(client, profile.id);

    const assetIds = new Set<string>([
      ...data.transactions.filter((tx) => tx.trade_date <= to).map((tx) => tx.asset_id),
      ...data.dividends.filter((div) => div.payment_date <= to).map((div) => div.asset_id),
    ]);
    const assets = data.assets.filter((asset) => assetIds.has(asset.id));

    const probeFrom = addDays(from, -10);
    const warnings: MarketWarning[] = [];

    const relevantCurrencies = new Set<Currency>([profile.base_currency]);
    for (const asset of assets) {
      relevantCurrencies.add(asset.currency);
      if (asset.manual_price_currency) relevantCurrencies.add(asset.manual_price_currency);
    }

    const currentFx = await this.market.currentRates(Array.from(relevantCurrencies), todayIso());

    const priceSeries = new Map<string, Map<string, Decimal>>();
    await Promise.all(
      assets.map(async (asset) => {
        const series = new Map<string, Decimal>();

        if (asset.price_mode === 'MANUAL') {
          const price = manualPriceInAssetCurrency(asset, currentFx.rates);
          if (price) series.set(probeFrom, price);
          priceSeries.set(asset.id, series);
          return;
        }

        try {
          const history = await this.market.getHistory(asset.symbol, probeFrom, to);
          for (const candle of history.candles) {
            series.set(candle.date, D(candle.adjusted_close ?? candle.close));
          }
          if (history.stale) {
            warnings.push({
              code: 'PRICE_STALE',
              symbol: asset.symbol,
              as_of: Array.from(series.keys()).sort().at(-1),
            });
          }
        } catch (error) {
          logger.debug({ err: error, symbol: asset.symbol }, 'Sin histórico de precios');
        }

        priceSeries.set(asset.id, series);
      }),
    );

    let benchmark: BenchmarkSeries | null = null;
    let benchmarkStale = false;

    if (includeBenchmark && profile.benchmark_symbol) {
      try {
        const history = await this.market.getHistory(profile.benchmark_symbol, probeFrom, to);
        const series = new Map<string, Decimal>();
        for (const candle of history.candles) {
          series.set(candle.date, D(candle.adjusted_close ?? candle.close));
        }
        if (series.size > 0) {
          benchmark = {
            symbol: profile.benchmark_symbol,
            name: profile.benchmark_symbol,
            currency: history.currency,
            series,
          };
          benchmarkStale = history.stale;
          relevantCurrencies.add(history.currency);
        }
      } catch (error) {
        logger.debug({ err: error }, 'Sin histórico del benchmark');
      }
    }

    const fxRates = await this.market.rateSeries(Array.from(relevantCurrencies), probeFrom, to);

    const result = buildHistory({
      from,
      to,
      interval,
      baseCurrency: profile.base_currency,
      assets,
      transactions: data.transactions.filter((tx) => tx.trade_date <= to),
      dividends: data.dividends.filter((div) => div.payment_date <= to),
      priceSeries,
      fxRates,
      benchmark,
    });

    return {
      series: result.series,
      benchmark: benchmark
        ? {
            symbol: benchmark.symbol,
            name: benchmark.name,
            currency: benchmark.currency,
            stale: benchmarkStale,
          }
        : null,
      warnings: dedupeWarnings([...warnings, ...result.warnings]),
    };
  }

  async getHistory(
    client: SupabaseClient,
    profile: ProfileRow,
    query: HistoryQuery,
  ): Promise<PortfolioHistoryResponse> {
    const data = await loadPortfolioData(client, profile.id);

    const dates = [
      ...data.transactions.map((tx) => tx.trade_date),
      ...data.dividends.map((div) => div.payment_date),
    ].filter((date) => date <= todayIso());

    const from = query.from ?? (dates.length > 0 ? dates.sort()[0]! : todayIso());
    const to = query.to && query.to < todayIso() ? query.to : todayIso();

    if (from > to) {
      throw new AppError(422, 'VALIDATION_ERROR', 'El rango de fechas no es válido.', {
        errors: [{ field: 'from', message: 'La fecha inicial no puede ser posterior a la final.' }],
      });
    }

    const result = await this.buildHistory(
      client,
      profile,
      from,
      to,
      query.interval,
      query.benchmark,
    );

    return {
      base_currency: profile.base_currency,
      from,
      to,
      interval: query.interval,
      benchmark: result.benchmark,
      series: result.series,
      warnings: result.warnings,
    };
  }

  async getAllocation(
    client: SupabaseClient,
    profile: ProfileRow,
    query: AllocationQuery,
  ): Promise<AllocationResponse> {
    const portfolio = await this.getPortfolio(client, profile, false);
    const allocation = computeAllocation(portfolio.positions, query.dimension, query.metric);

    return {
      dimension: query.dimension,
      metric: query.metric,
      base_currency: profile.base_currency,
      total: allocation.total,
      items: allocation.items,
    };
  }

  async getPerformance(
    client: SupabaseClient,
    profile: ProfileRow,
    query: PerformanceQuery,
  ): Promise<PerformanceResponse> {
    const data = await loadPortfolioData(client, profile.id);

    const allDates = [
      ...data.transactions.map((tx) => tx.trade_date),
      ...data.dividends.map((div) => div.payment_date),
    ].filter((date) => date <= todayIso());

    const earliest = allDates.length > 0 ? allDates.sort()[0]! : todayIso();
    const from = query.from ?? earliest;
    const to = query.to && query.to < todayIso() ? query.to : todayIso();

    if (from > to) {
      throw new AppError(422, 'VALIDATION_ERROR', 'El rango de fechas no es válido.', {
        errors: [{ field: 'from', message: 'La fecha inicial no puede ser posterior a la final.' }],
      });
    }

    const history = await this.buildHistory(client, profile, from, to, '1d', true);
    const ledgers = computeLedgers(data.transactions, profile.cost_method);

    const fx = await this.currentFx(profile, [profile.base_currency]);
    const baseRate = fx.baseRate;

    const inRange = data.transactions.filter(
      (tx) => tx.trade_date >= from && tx.trade_date <= to,
    );
    const dividendsInRange = data.dividends.filter(
      (div) => div.payment_date >= from && div.payment_date <= to,
    );

    let realizedEur = ZERO;
    let feesEur = ZERO;
    for (const ledger of ledgers.values()) {
      realizedEur = realizedEur.plus(ledger.realizedPnlEur);
    }
    for (const tx of data.transactions.filter((tx) => tx.trade_date <= to)) {
      feesEur = feesEur.plus(D(tx.fees).mul(D(tx.fx_rate_eur)));
    }

    const dividendsEur = Array.from(dividendsNetEur(data.dividends.filter((div) => div.payment_date <= to)).values()).reduce(
      (total, value) => total.plus(value),
      ZERO,
    );

    const flows: Array<{ date: string; amount: Decimal }> = [];

    const firstPoint = history.series[0];
    const lastPoint = history.series.at(-1);

    // Si hay posiciones anteriores al rango, se consideran capital inicial.
    const flowsOnFrom = inRange
      .filter((tx) => tx.trade_date === from)
      .reduce((total, tx) => {
        const gross = D(tx.quantity).mul(D(tx.unit_price));
        const net = tx.type === 'BUY'
          ? gross.plus(D(tx.fees)).mul(D(tx.fx_rate_eur))
          : gross.minus(D(tx.fees)).mul(D(tx.fx_rate_eur)).negated();
        return total.plus(net);
      }, ZERO);

    const initialValueBase = D(firstPoint?.market_value ?? '0');
    const initialValueEur = initialValueBase.mul(baseRate);
    const priorValueEur = initialValueEur.minus(flowsOnFrom);
    if (priorValueEur.gt(0)) {
      flows.push({ date: from, amount: priorValueEur.negated() });
    }

    for (const tx of inRange) {
      const gross = D(tx.quantity).mul(D(tx.unit_price));
      const netEur = tx.type === 'BUY'
        ? gross.plus(D(tx.fees)).mul(D(tx.fx_rate_eur))
        : gross.minus(D(tx.fees)).mul(D(tx.fx_rate_eur));
      flows.push({ date: tx.trade_date, amount: tx.type === 'BUY' ? netEur.negated() : netEur });
    }

    for (const dividend of dividendsInRange) {
      const net = D(dividend.gross_amount)
        .minus(D(dividend.withholding_tax))
        .mul(D(dividend.fx_rate_eur));
      flows.push({ date: dividend.payment_date, amount: net });
    }

    const finalValueEur = D(lastPoint?.market_value ?? '0').mul(baseRate);
    if (finalValueEur.gt(0)) flows.push({ date: to, amount: finalValueEur });

    const xirrValue = xirr(flows);
    const twrValue = twrPercent(history.series);

    const benchmarkTwr =
      history.benchmark && history.series.length >= 2
        ? (() => {
            const first = history.series.find((point) => point.benchmark_index !== null);
            const last = [...history.series].reverse().find((point) => point.benchmark_index !== null);
            if (!first || !last) return null;
            return percent(D(last.benchmark_index).minus(D(first.benchmark_index)), D(first.benchmark_index));
          })()
        : null;

    const netInvested = netInvestedEur(ledgers.values());

    return {
      base_currency: profile.base_currency,
      from,
      to,
      twr_pct: twrValue,
      xirr_pct: xirrValue === null ? null : xirrValue.toFixed(2),
      realized_pnl: money(eurToBase(fx, realizedEur)),
      dividends_net: money(eurToBase(fx, dividendsEur)),
      fees: money(eurToBase(fx, feesEur)),
      net_contributions: money(eurToBase(fx, netInvested)),
      start_value: money(D(firstPoint?.market_value ?? '0')),
      end_value: money(D(lastPoint?.market_value ?? '0')),
      benchmark:
        history.benchmark && benchmarkTwr !== null
          ? { symbol: history.benchmark.symbol, twr_pct: benchmarkTwr }
          : null,
    };
  }

  async getDividendsSummary(
    client: SupabaseClient,
    profile: ProfileRow,
    query: DividendsSummaryQuery,
  ): Promise<DividendSummaryResponse> {
    const { data, error } = await client
      .from('dividends')
      .select('*')
      .eq('user_id', profile.id)
      .order('payment_date', { ascending: true });

    if (error) dbFail(error, 'portfolio/dividends-summary');

    const rows = (data ?? []) as DividendRow[];

    // Se resuelven los símbolos con una segunda consulta para no depender de
    // que PostgREST infiera la FK compuesta (asset_id, user_id).
    const assetIds = Array.from(new Set(rows.map((row) => row.asset_id)));
    const symbols = new Map<string, string>();
    if (assetIds.length > 0) {
      const { data: assetsData, error: assetsError } = await client
        .from('assets')
        .select('id, symbol')
        .eq('user_id', profile.id)
        .in('id', assetIds);

      if (assetsError) dbFail(assetsError, 'portfolio/dividends-summary/assets');
      for (const asset of (assetsData ?? []) as Array<{ id: string; symbol: string }>) {
        symbols.set(asset.id, asset.symbol);
      }
    }

    const fx = await this.currentFx(profile, [profile.base_currency]);
    const baseRate = fx.baseRate;

    const filtered = rows.filter((row) => {
      if (query.from && row.payment_date < query.from) return false;
      if (query.to && row.payment_date > query.to) return false;
      return true;
    });

    const toBase = (value: Decimal): Decimal => (baseRate.isZero() ? value : value.div(baseRate));

    const groups = new Map<
      string,
      { label: string; gross: Decimal; withholding: Decimal; net: Decimal }
    >();

    let totalGross = ZERO;
    let totalWithholding = ZERO;
    let totalNet = ZERO;

    for (const row of filtered) {
      const rate = D(row.fx_rate_eur);
      const gross = D(row.gross_amount).mul(rate);
      const withholding = D(row.withholding_tax).mul(rate);
      const net = gross.minus(withholding);

      totalGross = totalGross.plus(gross);
      totalWithholding = totalWithholding.plus(withholding);
      totalNet = totalNet.plus(net);

      let key: string;
      let label: string;
      switch (query.group_by) {
        case 'month':
          key = row.payment_date.slice(0, 7);
          label = key;
          break;
        case 'asset':
          key = row.asset_id;
          label = symbols.get(row.asset_id) ?? row.asset_id;
          break;
        default:
          key = row.payment_date.slice(0, 4);
          label = key;
          break;
      }

      const group = groups.get(key) ?? { label, gross: ZERO, withholding: ZERO, net: ZERO };
      group.gross = group.gross.plus(gross);
      group.withholding = group.withholding.plus(withholding);
      group.net = group.net.plus(net);
      groups.set(key, group);
    }

    return {
      group_by: query.group_by,
      base_currency: profile.base_currency,
      total: {
        gross: money(toBase(totalGross)),
        withholding: money(toBase(totalWithholding)),
        net: money(toBase(totalNet)),
      },
      items: Array.from(groups.entries())
        .map(([key, group]) => ({
          key,
          label: group.label,
          gross: money(toBase(group.gross)),
          withholding: money(toBase(group.withholding)),
          net: money(toBase(group.net)),
        }))
        .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)),
    };
  }
}

export const portfolioService = new PortfolioService();
