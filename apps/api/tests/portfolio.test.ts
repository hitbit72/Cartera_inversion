import { describe, expect, it } from 'vitest';
import type { AssetRow, DividendRow, ProfileRow, TransactionRow } from '@cartera/shared';
import { D } from '../src/lib/decimal.js';
import {
  computeAllocation,
  computePortfolio,
  computeLedgers,
  type FxTable,
  type PriceInfo,
} from '../src/services/calculations/portfolio.js';

const profile: ProfileRow = {
  id: 'user-1',
  display_name: 'Inversor',
  base_currency: 'EUR',
  cost_method: 'FIFO',
  benchmark_symbol: 'URTH',
  theme: 'system',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const asset = (overrides: Partial<AssetRow> = {}): AssetRow => ({
  id: 'asset-a',
  user_id: 'user-1',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  asset_type: 'STOCK',
  sector: 'Tecnología',
  country: 'US',
  currency: 'USD',
  exchange: 'NASDAQ',
  isin: null,
  price_mode: 'AUTO',
  manual_price: null,
  manual_price_currency: null,
  manual_price_at: null,
  notes: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const transaction = (overrides: Partial<TransactionRow> = {}): TransactionRow => ({
  id: 'tx-1',
  user_id: 'user-1',
  account_id: 'account-1',
  asset_id: 'asset-a',
  type: 'BUY',
  trade_date: '2024-01-02',
  quantity: '10.0000000000',
  unit_price: '100.00000000',
  fees: '0.00000000',
  currency: 'USD',
  fx_rate_eur: '0.9000000000',
  fx_rate_date: '2024-01-02',
  fx_rate_source: 'AUTO',
  notes: null,
  created_at: '2024-01-02T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
  ...overrides,
});

const fx: FxTable = {
  baseCurrency: 'EUR',
  baseRate: D(1),
  rates: new Map([['USD', D('0.9')]]),
  date: '2024-06-01',
  source: 'frankfurter',
  stale: false,
};

describe('computePortfolio', () => {
  it('valora la posición, la plusvalía no realizada y los dividendos', () => {
    const assets = [asset()];
    const transactions = [transaction()];
    const dividends: DividendRow[] = [
      {
        id: 'div-1',
        user_id: 'user-1',
        account_id: 'account-1',
        asset_id: 'asset-a',
        payment_date: '2024-03-01',
        gross_amount: '10.00000000',
        withholding_tax: '2.00000000',
        currency: 'USD',
        fx_rate_eur: '0.9000000000',
        fx_rate_date: '2024-03-01',
        fx_rate_source: 'AUTO',
        notes: null,
        created_at: '2024-03-01T00:00:00.000Z',
        updated_at: '2024-03-01T00:00:00.000Z',
      },
    ];
    const prices = new Map<string, PriceInfo>([
      [
        'asset-a',
        {
          priceNative: D(110),
          currency: 'USD',
          date: '2024-06-01',
          stale: false,
          source: 'yahoo',
        },
      ],
    ]);

    const result = computePortfolio({
      profile,
      assets,
      transactions,
      dividends,
      ledgers: computeLedgers(transactions, 'FIFO'),
      prices,
      fx,
      includeClosed: false,
    });

    const position = result.positions[0]!;
    expect(position.quantity).toBe('10.0000000000');
    expect(position.avg_cost).toBe('90.00000000');
    expect(position.cost_basis).toBe('900.00000000');
    expect(position.current_price).toBe('99.00000000');
    expect(position.market_value).toBe('990.00000000');
    expect(position.unrealized_pnl).toBe('90.00000000');
    expect(position.unrealized_pnl_pct).toBe('10.00');
    expect(position.dividends_net).toBe('7.20000000');
    expect(position.total_pnl).toBe('97.20000000');
    expect(position.weight_pct).toBe('100.00');

    expect(result.totals.market_value).toBe('990.00000000');
    expect(result.totals.net_invested).toBe('900.00000000');
    expect(result.totals.total_return_pct).toBe('10.80');
    expect(result.warnings).toHaveLength(0);
  });

  it('mantiene las posiciones cerradas fuera de la vista pero en los totales', () => {
    const assets = [asset()];
    const transactions = [
      transaction(),
      transaction({
        id: 'tx-2',
        type: 'SELL',
        trade_date: '2024-04-01',
        unit_price: '120.00000000',
        fx_rate_eur: '0.9500000000',
      }),
    ];

    const base = {
      profile,
      assets,
      transactions,
      dividends: [] as DividendRow[],
      ledgers: computeLedgers(transactions, 'FIFO'),
      prices: new Map<string, PriceInfo>(),
      fx,
    };

    const withoutClosed = computePortfolio({ ...base, includeClosed: false });
    const withClosed = computePortfolio({ ...base, includeClosed: true });

    expect(withoutClosed.positions).toHaveLength(0);
    expect(withClosed.positions).toHaveLength(1);
    // Compra 10 × 100 × 0.9 = 900; venta 10 × 120 × 0.95 = 1140; plusvalía 240.
    expect(withClosed.totals.realized_pnl).toBe('240.00000000');
  });

  it('avisa cuando falta el precio de un activo abierto', () => {
    const result = computePortfolio({
      profile,
      assets: [asset()],
      transactions: [transaction()],
      dividends: [],
      ledgers: computeLedgers([transaction()], 'FIFO'),
      prices: new Map([
        ['asset-a', { priceNative: null, currency: 'USD', date: null, stale: true, source: 'yahoo' }],
      ]),
      fx,
      includeClosed: false,
    });

    expect(result.positions[0]?.market_value).toBe('900.00000000');
    expect(result.positions[0]?.unrealized_pnl).toBe('0.00000000');
    expect(result.warnings.map((warning) => warning.code)).toContain('PRICE_MISSING');
  });
});

describe('computeAllocation', () => {
  it('agrupa por sector y calcula pesos', () => {
    const assets = [asset(), asset({ id: 'asset-b', symbol: 'SAN', name: 'Santander', sector: 'Finanzas', country: 'ES', currency: 'EUR' })];
    const transactions = [
      transaction(),
      transaction({
        id: 'tx-2',
        asset_id: 'asset-b',
        quantity: '10.0000000000',
        unit_price: '100.00000000',
        currency: 'EUR',
        fx_rate_eur: '1.0000000000',
      }),
    ];
    const prices = new Map<string, PriceInfo>([
      ['asset-a', { priceNative: D(110), currency: 'USD', date: '2024-06-01', stale: false, source: 'yahoo' }],
      ['asset-b', { priceNative: D(100), currency: 'EUR', date: '2024-06-01', stale: false, source: 'yahoo' }],
    ]);

    const portfolio = computePortfolio({
      profile,
      assets,
      transactions,
      dividends: [],
      ledgers: computeLedgers(transactions, 'FIFO'),
      prices,
      fx,
      includeClosed: false,
    });

    const allocation = computeAllocation(portfolio.positions, 'sector', 'market_value');

    expect(allocation.total).toBe('1990.00000000');
    const tech = allocation.items.find((item) => item.key === 'Tecnología');
    expect(tech?.value).toBe('990.00000000');
    expect(tech?.weight_pct).toBe('49.75');
  });
});
