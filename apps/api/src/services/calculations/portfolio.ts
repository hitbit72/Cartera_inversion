import type {
  AllocationDimension,
  AllocationItem,
  AllocationMetric,
  AssetRow,
  CostMethod,
  Currency,
  DividendRow,
  MarketWarning,
  Position,
  ProfileRow,
  TransactionRow,
} from '@cartera/shared';
import { D, ZERO, money, percent, type Decimal } from '../../lib/decimal.js';
import { computeLedger, type LedgerResult } from './ledger.js';

export interface PriceInfo {
  /** Precio en la divisa del activo. */
  priceNative: Decimal | null;
  currency: Currency;
  date: string | null;
  stale: boolean;
  source: string;
}

export interface FxTable {
  baseCurrency: Currency;
  /** EUR por 1 unidad de la divisa base. 1 si la base es EUR. */
  baseRate: Decimal;
  /** EUR por 1 unidad de cada divisa. */
  rates: Map<Currency, Decimal>;
  date: string;
  source: string;
  stale: boolean;
}

export const fxEurPerUnit = (table: FxTable, currency: Currency): Decimal => {
  if (currency === 'EUR') return D(1);
  return table.rates.get(currency) ?? D(1);
};

/** Convierte un importe en EUR a la divisa base. */
export const eurToBase = (table: FxTable, amountEur: Decimal): Decimal =>
  table.baseRate.isZero() ? amountEur : amountEur.div(table.baseRate);

export interface PortfolioCalcInput {
  profile: ProfileRow;
  assets: AssetRow[];
  transactions: TransactionRow[];
  dividends: DividendRow[];
  ledgers: Map<string, LedgerResult>;
  prices: Map<string, PriceInfo>;
  fx: FxTable;
  includeClosed: boolean;
}

export interface PortfolioCalcResult {
  positions: Position[];
  totals: {
    market_value: string;
    cost_basis: string;
    unrealized_pnl: string;
    unrealized_pnl_pct: string;
    realized_pnl: string;
    dividends_net: string;
    total_pnl: string;
    total_return_pct: string;
    net_invested: string;
  };
  warnings: MarketWarning[];
}

export const emptyLedger = (assetId: string): LedgerResult => ({
  assetId,
  quantity: ZERO,
  costBasisEur: ZERO,
  costBasisNative: ZERO,
  realizedPnlEur: ZERO,
  avgCostEur: ZERO,
  avgCostNative: ZERO,
  lots: [],
  transactions: new Map(),
  oversold: [],
});

export const dividendsNetEur = (dividends: DividendRow[]): Map<string, Decimal> => {
  const byAsset = new Map<string, Decimal>();
  for (const dividend of dividends) {
    const net = D(dividend.gross_amount).minus(D(dividend.withholding_tax)).mul(D(dividend.fx_rate_eur));
    byAsset.set(dividend.asset_id, (byAsset.get(dividend.asset_id) ?? ZERO).plus(net));
  }
  return byAsset;
};

export const netInvestedEur = (ledgers: Iterable<LedgerResult>): Decimal => {
  let total = ZERO;
  for (const ledger of ledgers) {
    for (const computation of ledger.transactions.values()) {
      total = total.plus(computation.flowEur);
    }
  }
  return total;
};

interface InternalPosition {
  position: Position;
  marketValue: Decimal;
  isOpen: boolean;
}

export const computePortfolio = (input: PortfolioCalcInput): PortfolioCalcResult => {
  const warnings: MarketWarning[] = [];
  const dividendsByAsset = dividendsNetEur(input.dividends);
  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));

  const internal: InternalPosition[] = [];

  const processed = new Set<string>([
    ...input.transactions.map((tx) => tx.asset_id),
    ...input.dividends.map((dividend) => dividend.asset_id),
  ]);

  for (const assetId of processed) {
    const asset = assetsById.get(assetId);
    if (!asset) continue;

    const ledger = input.ledgers.get(assetId) ?? emptyLedger(assetId);
    const quantityValue = ledger.quantity;
    const priceInfo = input.prices.get(assetId) ?? null;

    const priceNativeValue = priceInfo?.priceNative ?? null;
    const priceEurPerUnit =
      priceNativeValue === null ? null : priceNativeValue.mul(fxEurPerUnit(input.fx, priceInfo!.currency));
    const priceBaseValue =
      priceEurPerUnit === null ? null : eurToBase(input.fx, priceEurPerUnit);

    const isOpen = quantityValue.gt(0);

    if (priceNativeValue === null) {
      if (isOpen) warnings.push({ code: 'PRICE_MISSING', symbol: asset.symbol });
    } else if (priceInfo?.stale && isOpen) {
      warnings.push({
        code: 'PRICE_STALE',
        symbol: asset.symbol,
        as_of: priceInfo.date ?? undefined,
      });
    }

    const costBasisBase = eurToBase(input.fx, ledger.costBasisEur);
    // Sin precio se valora al coste: evita mostrar una pérdida ficticia del 100 %
    // mientras el proveedor de datos está caído.
    const marketValueBase =
      priceBaseValue === null ? costBasisBase : quantityValue.mul(priceBaseValue);
    const unrealized = priceBaseValue === null ? ZERO : marketValueBase.minus(costBasisBase);
    const realizedBase = eurToBase(input.fx, ledger.realizedPnlEur);
    const divBase = eurToBase(input.fx, dividendsByAsset.get(assetId) ?? ZERO);
    const total = realizedBase.plus(unrealized).plus(divBase);

    const position: Position = {
      asset: {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        asset_type: asset.asset_type,
        sector: asset.sector,
        country: asset.country,
        currency: asset.currency,
      },
      quantity: quantityValue.toFixed(10),
      avg_cost_native: money(ledger.avgCostNative),
      avg_cost: money(eurToBase(input.fx, ledger.avgCostEur)),
      cost_basis: money(costBasisBase),
      current_price_native: priceNativeValue === null ? null : money(priceNativeValue),
      current_price: priceBaseValue === null ? null : money(priceBaseValue),
      price_date: priceInfo?.date ?? null,
      price_stale: priceInfo?.stale ?? false,
      market_value: money(marketValueBase),
      unrealized_pnl: money(unrealized),
      unrealized_pnl_pct: percent(unrealized, costBasisBase),
      realized_pnl: money(realizedBase),
      dividends_net: money(divBase),
      total_pnl: money(total),
      weight_pct: '0.00',
    };

    internal.push({ position, marketValue: marketValueBase, isOpen });
  }

  // Totales: incluyen plusvalías realizadas y dividendos de posiciones cerradas.
  const totalsDecimal = internal.reduce(
    (acc, item) => {
      acc.marketValue = acc.marketValue.plus(item.marketValue);
      acc.cost = acc.cost.plus(D(item.position.cost_basis));
      acc.unrealized = acc.unrealized.plus(D(item.position.unrealized_pnl));
      acc.realized = acc.realized.plus(D(item.position.realized_pnl));
      acc.dividends = acc.dividends.plus(D(item.position.dividends_net));
      acc.total = acc.total.plus(D(item.position.total_pnl));
      return acc;
    },
    {
      marketValue: ZERO,
      cost: ZERO,
      unrealized: ZERO,
      realized: ZERO,
      dividends: ZERO,
      total: ZERO,
    },
  );

  const openMarketValue = internal
    .filter((item) => item.isOpen)
    .reduce((total, item) => total.plus(item.marketValue), ZERO);

  for (const item of internal) {
    item.position.weight_pct = item.isOpen
      ? percent(item.marketValue, openMarketValue)
      : '0.00';
  }

  const netInvested = eurToBase(
    input.fx,
    netInvestedEur(input.transactions.length > 0 ? input.ledgers.values() : []),
  );
  const denominator = netInvested.gt(0) ? netInvested : D(totalsDecimal.cost);
  const totalReturnPct = percent(totalsDecimal.total, denominator);

  const visible = internal
    .filter((item) => item.isOpen || input.includeClosed)
    .map((item) => item.position)
    .sort((a, b) => Number(b.market_value) - Number(a.market_value));

  return {
    positions: visible,
    totals: {
      market_value: money(totalsDecimal.marketValue),
      cost_basis: money(totalsDecimal.cost),
      unrealized_pnl: money(totalsDecimal.unrealized),
      unrealized_pnl_pct: percent(totalsDecimal.unrealized, totalsDecimal.cost),
      realized_pnl: money(totalsDecimal.realized),
      dividends_net: money(totalsDecimal.dividends),
      total_pnl: money(totalsDecimal.total),
      total_return_pct: totalReturnPct,
      net_invested: money(netInvested),
    },
    warnings: dedupeWarnings(warnings),
  };
};

export const computeLedgers = (
  transactions: TransactionRow[],
  method: CostMethod,
): Map<string, LedgerResult> => {
  const ids = new Set(transactions.map((tx) => tx.asset_id));
  const map = new Map<string, LedgerResult>();
  for (const id of ids) map.set(id, computeLedger(id, transactions, method));
  return map;
};

export const computeAllocation = (
  positions: Position[],
  dimension: AllocationDimension,
  metric: AllocationMetric,
): { items: AllocationItem[]; total: string } => {
  const groups = new Map<string, { label: string; value: Decimal }>();

  for (const position of positions) {
    let key: string;
    let label: string;

    switch (dimension) {
      case 'asset_type':
        key = position.asset.asset_type;
        label = position.asset.asset_type;
        break;
      case 'sector':
        key = position.asset.sector ?? 'Sin clasificar';
        label = position.asset.sector ?? 'Sin clasificar';
        break;
      case 'country':
        key = position.asset.country ?? 'Sin país';
        label = position.asset.country ?? 'Sin país';
        break;
      // Exposición por divisa del activo: útil para un inversor con base EUR.
      case 'currency':
        key = position.asset.currency;
        label = position.asset.currency;
        break;
      default:
        key = position.asset.symbol;
        label = position.asset.name;
        break;
    }

    const raw = metric === 'market_value' ? position.market_value : position.cost_basis;
    const current = groups.get(key) ?? { label, value: ZERO };
    current.value = current.value.plus(D(raw));
    groups.set(key, current);
  }

  const total = Array.from(groups.values()).reduce((acc, group) => acc.plus(group.value), ZERO);

  const items = Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      label: group.label,
      value: money(group.value),
      weight_pct: percent(group.value, total),
    }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  return { items, total: money(total) };
};

const warningKey = (warning: MarketWarning): string =>
  `${warning.code}:${warning.symbol ?? ''}:${warning.as_of ?? ''}`;

export const dedupeWarnings = (warnings: MarketWarning[]): MarketWarning[] => {
  const seen = new Set<string>();
  const result: MarketWarning[] = [];
  for (const warning of warnings) {
    const key = warningKey(warning);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(warning);
    }
  }
  return result;
};
