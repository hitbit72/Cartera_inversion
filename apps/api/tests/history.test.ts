import { describe, expect, it } from 'vitest';
import type { AssetRow, TransactionRow } from '@cartera/shared';
import { D } from '../src/lib/decimal.js';
import { buildHistory } from '../src/services/calculations/history.js';

const asset: AssetRow = {
  id: 'asset-a',
  user_id: 'user-1',
  symbol: 'TEST',
  name: 'Test Corp',
  asset_type: 'STOCK',
  sector: 'Tecnología',
  country: 'ES',
  currency: 'EUR',
  exchange: null,
  isin: null,
  price_mode: 'AUTO',
  manual_price: null,
  manual_price_currency: null,
  manual_price_at: null,
  notes: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const buy: TransactionRow = {
  id: 'tx-1',
  user_id: 'user-1',
  account_id: 'account-1',
  asset_id: 'asset-a',
  type: 'BUY',
  trade_date: '2024-01-02',
  quantity: '10.0000000000',
  unit_price: '10.00000000',
  fees: '0.00000000',
  currency: 'EUR',
  fx_rate_eur: '1.0000000000',
  fx_rate_date: '2024-01-02',
  fx_rate_source: 'AUTO',
  notes: null,
  created_at: '2024-01-02T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
};

const priceSeries = new Map([
  [
    'asset-a',
    new Map([
      ['2024-01-01', D(10)],
      ['2024-01-02', D(10)],
      ['2024-01-03', D(10)],
      ['2024-01-04', D(11)],
      ['2024-01-05', D(12)],
    ]),
  ],
]);

const run = (overrides: Partial<Parameters<typeof buildHistory>[0]> = {}) =>
  buildHistory({
    from: '2024-01-01',
    to: '2024-01-05',
    interval: '1d',
    baseCurrency: 'EUR',
    assets: [asset],
    transactions: [buy],
    dividends: [],
    priceSeries,
    fxRates: new Map(),
    benchmark: null,
    ...overrides,
  });

describe('buildHistory', () => {
  it('genera una serie diaria con valor de cartera y aportaciones', () => {
    const { series, warnings } = run();

    expect(warnings).toHaveLength(0);
    expect(series).toHaveLength(5);
    expect(series[0]?.market_value).toBe('0.00000000');
    expect(series[1]?.market_value).toBe('100.00000000');
    expect(series[1]?.net_contributions).toBe('100.00000000');
    expect(series.at(-1)?.market_value).toBe('120.00000000');
  });

  it('calcula el índice TWR sin contar las aportaciones como rentabilidad', () => {
    const { series } = run();

    // 10 → 11 → 12 sobre una posición de 10 títulos: +20 % acumulado.
    expect(series.at(-1)?.twr_index).toBe('120.00');
  });

  it('añade los dividendos al valor total sin tratarlos como aportación', () => {
    const { series } = run({
      dividends: [
        {
          id: 'div-1',
          user_id: 'user-1',
          account_id: 'account-1',
          asset_id: 'asset-a',
          payment_date: '2024-01-04',
          gross_amount: '10.00000000',
          withholding_tax: '0.00000000',
          currency: 'EUR',
          fx_rate_eur: '1.0000000000',
          fx_rate_date: '2024-01-04',
          fx_rate_source: 'AUTO',
          notes: null,
          created_at: '2024-01-04T00:00:00.000Z',
          updated_at: '2024-01-04T00:00:00.000Z',
        },
      ],
    });

    const last = series.at(-1)!;
    expect(last.market_value).toBe('120.00000000');
    expect(last.dividends_cum).toBe('10.00000000');
    expect(last.total_value).toBe('130.00000000');
    // Precio 10 → 12 (+20 %) más 10 de dividendo sobre 100 aportados (+10 %) = +30 %.
    expect(Number(last.twr_index)).toBeCloseTo(130, 1);
  });

  it('no infla el TWR cuando el primer día hay compra y venta', () => {
    const sell: TransactionRow = {
      ...buy,
      id: 'tx-2',
      type: 'SELL',
      quantity: '4.0000000000',
      unit_price: '12.00000000',
    };

    const { series } = run({ to: '2024-01-02', transactions: [buy, sell] });
    const last = series.at(-1)!;

    // Se aportan 100 y se retiran 4 × 12 = 48; quedan 6 títulos a 10 = 60.
    // El rendimiento se mide sobre los 100 aportados (108), no sobre el neto 52.
    expect(last.market_value).toBe('60.00000000');
    expect(last.net_contributions).toBe('52.00000000');
    expect(last.twr_index).toBe('108.00');
  });

  it('muestra una advertencia si falta el histórico de precios', () => {
    const { warnings } = run({ priceSeries: new Map() });
    expect(warnings.some((warning) => warning.code === 'PRICE_MISSING')).toBe(true);
  });
});
