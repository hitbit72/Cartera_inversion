import type { AllocationDimension } from '../constants.js';
import type { AssetType, Currency, CostMethod, TransactionType } from './db.js';

export interface AssetSummary {
  id: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  sector: string | null;
  country: string | null;
  currency: Currency;
}

export interface Position {
  asset: AssetSummary;
  quantity: string;
  avg_cost_native: string;
  avg_cost: string;
  cost_basis: string;
  current_price_native: string | null;
  current_price: string | null;
  price_date: string | null;
  price_stale: boolean;
  market_value: string;
  unrealized_pnl: string;
  unrealized_pnl_pct: string;
  realized_pnl: string;
  dividends_net: string;
  total_pnl: string;
  weight_pct: string;
}

export interface PortfolioTotals {
  market_value: string;
  cost_basis: string;
  unrealized_pnl: string;
  unrealized_pnl_pct: string;
  realized_pnl: string;
  dividends_net: string;
  total_pnl: string;
  total_return_pct: string;
  net_invested: string;
}

export interface MarketWarning {
  code: 'PRICE_STALE' | 'FX_STALE' | 'PRICE_MISSING';
  symbol?: string;
  as_of?: string;
}

export interface PortfolioResponse {
  base_currency: Currency;
  as_of: string;
  cost_method: CostMethod;
  fx: { date: string; source: string; stale: boolean };
  positions: Position[];
  totals: PortfolioTotals;
  warnings: MarketWarning[];
}

export interface HistoryPoint {
  date: string;
  market_value: string;
  net_contributions: string;
  dividends_cum: string;
  total_value: string;
  twr_index: string;
  benchmark_index: string | null;
}

export interface PortfolioHistoryResponse {
  base_currency: Currency;
  from: string;
  to: string;
  interval: '1d' | '1w' | '1m';
  benchmark: { symbol: string; name: string; currency: Currency; stale: boolean } | null;
  series: HistoryPoint[];
  warnings: MarketWarning[];
}

export interface AllocationItem {
  key: string;
  label: string;
  value: string;
  weight_pct: string;
}

export interface AllocationResponse {
  dimension: AllocationDimension;
  metric: 'market_value' | 'cost_basis';
  base_currency: Currency;
  total: string;
  items: AllocationItem[];
}

export interface PerformanceResponse {
  base_currency: Currency;
  from: string;
  to: string;
  twr_pct: string;
  xirr_pct: string | null;
  realized_pnl: string;
  dividends_net: string;
  fees: string;
  net_contributions: string;
  start_value: string;
  end_value: string;
  benchmark: { symbol: string; twr_pct: string } | null;
}

export interface DividendSummaryItem {
  key: string;
  label: string;
  gross: string;
  withholding: string;
  net: string;
}

export interface DividendSummaryResponse {
  group_by: 'year' | 'month' | 'asset';
  base_currency: Currency;
  total: { gross: string; withholding: string; net: string };
  items: DividendSummaryItem[];
}

export interface Quote {
  symbol: string;
  price: string;
  currency: Currency;
  as_of: string;
  source: 'yahoo' | 'manual';
  stale: boolean;
}

export interface Candle {
  date: string;
  close: string;
  adjusted_close?: string;
}

export interface Instrument {
  symbol: string;
  name: string;
  exchange: string | null;
  asset_type: AssetType;
  currency: Currency;
}

export interface TransactionView {
  id: string;
  asset_id: string;
  type: TransactionType;
  trade_date: string;
  quantity: string;
  unit_price: string;
  fees: string;
  currency: Currency;
  fx_rate_eur: string;
  fx_rate_date: string;
  fx_rate_source: 'AUTO' | 'MANUAL';
  amount_base: string;
  fees_base: string;
  net_amount_base: string;
  realized_pnl_base: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DividendView {
  id: string;
  asset_id: string;
  payment_date: string;
  gross_amount: string;
  withholding_tax: string;
  currency: Currency;
  fx_rate_eur: string;
  fx_rate_date: string;
  fx_rate_source: 'AUTO' | 'MANUAL';
  net_amount: string;
  net_amount_base: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
