export const CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'JPY',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HKD',
  'SGD',
] as const;

export const ASSET_TYPES = ['STOCK', 'CRYPTO', 'ETF', 'FUND', 'BOND'] as const;
export const TRANSACTION_TYPES = ['BUY', 'SELL'] as const;
export const COST_METHODS = ['FIFO', 'AVERAGE'] as const;
export const THEMES = ['light', 'dark', 'system'] as const;
export const PRICE_MODES = ['AUTO', 'MANUAL'] as const;
export const FX_RATE_SOURCES = ['AUTO', 'MANUAL'] as const;
export const HISTORY_INTERVALS = ['1d', '1w', '1m'] as const;
export const ALLOCATION_DIMENSIONS = ['asset_type', 'sector', 'country', 'currency', 'asset'] as const;
export const ALLOCATION_METRICS = ['market_value', 'cost_basis'] as const;
export const DIVIDEND_GROUPS = ['year', 'month', 'asset'] as const;

export const DEFAULT_BENCHMARK_SYMBOL = 'URTH';
export const PIVOT_CURRENCY = 'EUR';
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 50;

export type CurrencyCode = (typeof CURRENCIES)[number];
export type AssetType = (typeof ASSET_TYPES)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type CostMethod = (typeof COST_METHODS)[number];
export type Theme = (typeof THEMES)[number];
export type PriceMode = (typeof PRICE_MODES)[number];
export type FxRateSource = (typeof FX_RATE_SOURCES)[number];
export type HistoryInterval = (typeof HISTORY_INTERVALS)[number];
export type AllocationDimension = (typeof ALLOCATION_DIMENSIONS)[number];
export type AllocationMetric = (typeof ALLOCATION_METRICS)[number];
export type DividendGroup = (typeof DIVIDEND_GROUPS)[number];
