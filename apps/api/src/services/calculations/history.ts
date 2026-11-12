import type {
  AssetRow,
  Currency,
  DividendRow,
  HistoryPoint,
  MarketWarning,
  TransactionRow,
} from '@cartera/shared';
import { D, ZERO, type Decimal } from '../../lib/decimal.js';
import { eachDay } from '../../lib/dates.js';
import { dedupeWarnings } from './portfolio.js';

export interface BenchmarkSeries {
  symbol: string;
  name: string;
  currency: Currency;
  series: Map<string, Decimal>;
}

export interface HistoryInput {
  from: string;
  to: string;
  interval: '1d' | '1w' | '1m';
  baseCurrency: Currency;
  assets: AssetRow[];
  transactions: TransactionRow[];
  dividends: DividendRow[];
  /** Precio nativo por activo y fecha (divisa del activo). */
  priceSeries: Map<string, Map<string, Decimal>>;
  /** EUR por 1 unidad de divisa, por fecha. */
  fxRates: Map<Currency, Map<string, Decimal>>;
  benchmark: BenchmarkSeries | null;
}

export interface HistoryResult {
  series: HistoryPoint[];
  warnings: MarketWarning[];
}

interface DayEvent {
  contributionsEur: Decimal;
  /** Aportaciones brutas del día (compras). */
  inflowEur: Decimal;
  /** Retiradas brutas del día (ventas). */
  outflowEur: Decimal;
  dividendsEur: Decimal;
  quantityDelta: Map<string, Decimal>;
}

const fxLookup = (rates: Map<Currency, Map<string, Decimal>>, currency: Currency) => {
  if (currency === 'EUR') return (): Decimal => D(1);
  const entries = Array.from((rates.get(currency) ?? new Map<string, Decimal>()).entries()).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );

  let index = 0;
  let current: Decimal | null = null;

  return (day: string): Decimal => {
    while (index < entries.length && entries[index]![0] <= day) {
      current = entries[index]![1];
      index += 1;
    }
    return current ?? D(1);
  };
};

const priceLookup = (series: Map<string, Decimal> | undefined) => {
  const entries = series
    ? Array.from(series.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    : [];

  let index = 0;
  let current: Decimal | null = null;

  return (day: string): Decimal | null => {
    while (index < entries.length && entries[index]![0] <= day) {
      current = entries[index]![1];
      index += 1;
    }
    return current;
  };
};

const sampleDates = (days: string[], interval: '1d' | '1w' | '1m'): Set<string> => {
  if (interval === '1d') return new Set(days);
  const selected = new Set<string>();

  if (interval === '1w') {
    for (let i = 0; i < days.length; i += 7) selected.add(days[i]!);
    selected.add(days[days.length - 1]!);
    return selected;
  }

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i]!;
    const next = days[i + 1];
    if (!next || next.slice(0, 7) !== day.slice(0, 7)) selected.add(day);
  }
  selected.add(days[days.length - 1]!);
  return selected;
};

export const buildHistory = (input: HistoryInput): HistoryResult => {
  const warnings: MarketWarning[] = [];
  const days = eachDay(input.from, input.to);
  if (days.length === 0) return { series: [], warnings };

  const events = new Map<string, DayEvent>();
  const eventFor = (day: string): DayEvent => {
    const existing = events.get(day);
    if (existing) return existing;
    const created: DayEvent = {
      contributionsEur: ZERO,
      inflowEur: ZERO,
      outflowEur: ZERO,
      dividendsEur: ZERO,
      quantityDelta: new Map(),
    };
    events.set(day, created);
    return created;
  };

  for (const tx of input.transactions) {
    if (tx.trade_date > input.to) continue;
    const event = eventFor(tx.trade_date);
    const gross = D(tx.quantity).mul(D(tx.unit_price));
    const fees = D(tx.fees);
    const fx = D(tx.fx_rate_eur);
    // Compra: aportación positiva. Venta: retirada (importe neto recibido).
    if (tx.type === 'BUY') {
      const inflow = gross.plus(fees).mul(fx);
      event.inflowEur = event.inflowEur.plus(inflow);
      event.contributionsEur = event.contributionsEur.plus(inflow);
    } else {
      const outflow = gross.minus(fees).mul(fx);
      event.outflowEur = event.outflowEur.plus(outflow);
      event.contributionsEur = event.contributionsEur.minus(outflow);
    }
    const delta = D(tx.quantity).mul(tx.type === 'BUY' ? 1 : -1);
    event.quantityDelta.set(tx.asset_id, (event.quantityDelta.get(tx.asset_id) ?? ZERO).plus(delta));
  }

  for (const dividend of input.dividends) {
    if (dividend.payment_date > input.to) continue;
    const net = D(dividend.gross_amount)
      .minus(D(dividend.withholding_tax))
      .mul(D(dividend.fx_rate_eur));
    const event = eventFor(dividend.payment_date);
    event.dividendsEur = event.dividendsEur.plus(net);
  }

  let cumulativeContributions = ZERO;
  let cumulativeDividends = ZERO;
  const quantities = new Map<string, Decimal>();

  // Estado inicial: todo lo anterior al rango solicitado.
  for (const tx of input.transactions) {
    if (tx.trade_date >= input.from) continue;
    const gross = D(tx.quantity).mul(D(tx.unit_price));
    const fees = D(tx.fees);
    const fx = D(tx.fx_rate_eur);
    cumulativeContributions = cumulativeContributions.plus(
      tx.type === 'BUY' ? gross.plus(fees).mul(fx) : gross.minus(fees).mul(fx).negated(),
    );
    const delta = D(tx.quantity).mul(tx.type === 'BUY' ? 1 : -1);
    quantities.set(tx.asset_id, (quantities.get(tx.asset_id) ?? ZERO).plus(delta));
  }
  for (const dividend of input.dividends) {
    if (dividend.payment_date >= input.from) continue;
    cumulativeDividends = cumulativeDividends.plus(
      D(dividend.gross_amount).minus(D(dividend.withholding_tax)).mul(D(dividend.fx_rate_eur)),
    );
  }

  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const prices = new Map<string, (day: string) => Decimal | null>();
  for (const asset of input.assets) {
    const lookup = priceLookup(input.priceSeries.get(asset.id));
    prices.set(asset.id, lookup);
    if (!input.priceSeries.has(asset.id)) {
      warnings.push({ code: 'PRICE_MISSING', symbol: asset.symbol });
    }
  }

  const currencyRates = new Map<Currency, (day: string) => Decimal>();
  for (const currency of input.fxRates.keys()) {
    currencyRates.set(currency, fxLookup(input.fxRates, currency));
  }
  const baseRateOn = fxLookup(input.fxRates, input.baseCurrency);

  const benchmarkEntries = input.benchmark
    ? Array.from(input.benchmark.series.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    : [];

  let benchmarkBase: Decimal | null = null;
  let benchmarkIndexPointer = 0;
  let benchmarkCurrent: Decimal | null = null;
  const benchmarkRateOn = input.benchmark
    ? fxLookup(input.fxRates, input.benchmark.currency)
    : (): Decimal => D(1);

  let previousTotalEur: Decimal = ZERO;
  let twr = D(1);
  const daily: Array<{
    day: string;
    marketValue: Decimal;
    contributions: Decimal;
    dividends: Decimal;
    total: Decimal;
    twrIndex: Decimal;
    benchmarkIndex: Decimal | null;
  }> = [];

  for (const day of days) {
    const event = events.get(day);
    // Flujo del día (no acumulado): es lo que exige la fórmula de TWR.
    const dayFlow = event?.contributionsEur ?? ZERO;
    const dayInflow = event?.inflowEur ?? ZERO;
    const dayOutflow = event?.outflowEur ?? ZERO;
    if (event) {
      cumulativeContributions = cumulativeContributions.plus(event.contributionsEur);
      cumulativeDividends = cumulativeDividends.plus(event.dividendsEur);
      for (const [assetId, delta] of event.quantityDelta) {
        quantities.set(assetId, (quantities.get(assetId) ?? ZERO).plus(delta));
      }
    }

    const baseRate = baseRateOn(day);
    const baseDivisor = baseRate.isZero() ? D(1) : baseRate;

    let marketValueEur = ZERO;
    for (const [assetId, quantityValue] of quantities) {
      if (quantityValue.lte(0)) continue;
      const asset = assetsById.get(assetId);
      if (!asset) continue;
      const price = prices.get(assetId)?.(day) ?? null;
      if (price === null) {
        warnings.push({ code: 'PRICE_MISSING', symbol: asset.symbol });
        continue;
      }
      const currencyRate = asset.currency === 'EUR' ? D(1) : (currencyRates.get(asset.currency)?.(day) ?? D(1));
      marketValueEur = marketValueEur.plus(quantityValue.mul(price).mul(currencyRate));
    }

    const totalEur = marketValueEur.plus(cumulativeDividends);

    if (!previousTotalEur.isZero()) {
      // Flujos a cierre de día: el importe aportado o retirado ese día no es
      // rentabilidad.
      const returnDay = totalEur.minus(dayFlow).div(previousTotalEur).minus(1);
      twr = twr.mul(D(1).plus(returnDay));
    } else if (dayInflow.gt(0)) {
      // Primera aportación (o reinicio tras vender todo): la base es el dinero
      // aportado, no el neto de ventas. Si el mismo día se vende parte de la
      // posición, el efectivo retirado también forma parte de lo generado.
      const returnDay = totalEur.plus(dayOutflow).div(dayInflow);
      twr = twr.mul(returnDay);
    }
    previousTotalEur = totalEur;

    // Benchmark: cierres ajustados, indexados a 100 en el primer dato del rango.
    let benchmarkIndex: Decimal | null = null;
    if (input.benchmark) {
      while (
        benchmarkIndexPointer < benchmarkEntries.length &&
        benchmarkEntries[benchmarkIndexPointer]![0] <= day
      ) {
        benchmarkCurrent = benchmarkEntries[benchmarkIndexPointer]![1];
        benchmarkIndexPointer += 1;
      }
      if (benchmarkCurrent !== null) {
        const benchEur = benchmarkCurrent.mul(benchmarkRateOn(day));
        if (benchmarkBase === null) benchmarkBase = benchEur;
        if (benchmarkBase && !benchmarkBase.isZero()) {
          benchmarkIndex = benchEur.div(benchmarkBase).mul(100);
        }
      }
    }

    daily.push({
      day,
      marketValue: marketValueEur.div(baseDivisor),
      contributions: cumulativeContributions.div(baseDivisor),
      dividends: cumulativeDividends.div(baseDivisor),
      total: totalEur.div(baseDivisor),
      twrIndex: twr.mul(100),
      benchmarkIndex,
    });
  }

  const selected = sampleDates(days, input.interval);
  const series: HistoryPoint[] = daily
    .filter((point) => selected.has(point.day))
    .map((point) => ({
      date: point.day,
      market_value: point.marketValue.toFixed(8),
      net_contributions: point.contributions.toFixed(8),
      dividends_cum: point.dividends.toFixed(8),
      total_value: point.total.toFixed(8),
      twr_index: point.twrIndex.toFixed(2),
      benchmark_index: point.benchmarkIndex === null ? null : point.benchmarkIndex.toFixed(2),
    }));

  return { series, warnings: dedupeWarnings(warnings) };
};

/** Interpola (hacia atrás) un valor por fecha dentro de una serie diaria. */
export const valueOn = (
  series: Array<{ date: string; value: Decimal }>,
  day: string,
): Decimal | null => {
  let result: Decimal | null = null;
  for (const point of series) {
    if (point.date > day) break;
    result = point.value;
  }
  return result;
};
