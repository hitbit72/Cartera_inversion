import type {
  AssetType,
  CostMethod,
  CurrencyCode,
  FxRateSource,
  PriceMode,
  Theme,
  TransactionType,
} from '../constants.js';

// Los tipos de dominio se definen una sola vez en constants.ts.
export type Currency = CurrencyCode;
export type { AssetType, CostMethod, FxRateSource, PriceMode, Theme, TransactionType };

export interface ProfileRow {
  id: string;
  display_name: string;
  base_currency: Currency;
  cost_method: CostMethod;
  benchmark_symbol: string | null;
  theme: Theme;
  created_at: string;
  updated_at: string;
}

export interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  sector: string | null;
  country: string | null;
  currency: Currency;
  exchange: string | null;
  isin: string | null;
  price_mode: PriceMode;
  manual_price: string | null;
  manual_price_currency: Currency | null;
  manual_price_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string;
  asset_id: string;
  type: TransactionType;
  trade_date: string;
  quantity: string;
  unit_price: string;
  fees: string;
  currency: Currency;
  fx_rate_eur: string;
  fx_rate_date: string;
  fx_rate_source: FxRateSource;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DividendRow {
  id: string;
  user_id: string;
  account_id: string;
  asset_id: string;
  payment_date: string;
  gross_amount: string;
  withholding_tax: string;
  currency: Currency;
  fx_rate_eur: string;
  fx_rate_date: string;
  fx_rate_source: FxRateSource;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvitationRow {
  id: string;
  email: string;
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MarketPriceRow {
  symbol: string;
  price_date: string;
  close_price: string;
  currency: Currency;
  source: string;
  fetched_at: string;
}

export interface FxRateRow {
  base_currency: 'EUR';
  quote_currency: Currency;
  rate_date: string;
  rate: string;
  source: string;
  fetched_at: string;
}
