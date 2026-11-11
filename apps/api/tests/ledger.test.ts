import { describe, expect, it } from 'vitest';
import { computeLedger, sortLedgerTransactions, type LedgerTransaction } from '../src/services/calculations/ledger.js';

const tx = (overrides: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'id' | 'type' | 'quantity' | 'unit_price'>): LedgerTransaction => ({
  asset_id: 'asset-1',
  trade_date: '2024-01-01',
  fees: '0',
  fx_rate_eur: '1',
  created_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('computeLedger · FIFO', () => {
  it('consume los lotes más antiguos y calcula la plusvalía realizada', () => {
    const transactions = [
      tx({ id: 'b1', type: 'BUY', quantity: '10', unit_price: '100', trade_date: '2024-01-02' }),
      tx({ id: 'b2', type: 'BUY', quantity: '5', unit_price: '120', trade_date: '2024-02-01' }),
      tx({ id: 's1', type: 'SELL', quantity: '12', unit_price: '150', fees: '10', trade_date: '2024-03-01' }),
    ];

    const ledger = computeLedger('asset-1', transactions, 'FIFO');

    expect(ledger.quantity.toFixed(10)).toBe('3.0000000000');
    expect(ledger.costBasisEur.toFixed(8)).toBe('360.00000000');
    expect(ledger.avgCostEur.toFixed(8)).toBe('120.00000000');
    // 12 × 150 − 10 comisiones − (10 × 100 + 2 × 120) = 550
    expect(ledger.realizedPnlEur.toFixed(8)).toBe('550.00000000');
    expect(ledger.oversold).toHaveLength(0);
    expect(ledger.transactions.get('s1')?.realizedPnlEur?.toFixed(8)).toBe('550.00000000');
  });

  it('aplica el tipo de cambio de cada operación', () => {
    const transactions = [
      tx({
        id: 'b1',
        type: 'BUY',
        quantity: '10',
        unit_price: '100',
        fx_rate_eur: '0.9',
        trade_date: '2024-01-02',
      }),
      tx({
        id: 's1',
        type: 'SELL',
        quantity: '10',
        unit_price: '120',
        fees: '5',
        fx_rate_eur: '0.95',
        trade_date: '2024-04-01',
      }),
    ];

    const ledger = computeLedger('asset-1', transactions, 'FIFO');

    expect(ledger.quantity.isZero()).toBe(true);
    expect(ledger.costBasisEur.isZero()).toBe(true);
    // (1200 − 5) × 0.95 − 1000 × 0.9 = 1135.25 − 900 = 235.25
    expect(ledger.realizedPnlEur.toFixed(8)).toBe('235.25000000');
  });

  it('deja la posición a cero tras vender todo y permite recomprar', () => {
    const transactions = [
      tx({ id: 'b1', type: 'BUY', quantity: '2', unit_price: '50', trade_date: '2024-01-02' }),
      tx({ id: 's1', type: 'SELL', quantity: '2', unit_price: '60', trade_date: '2024-02-02' }),
      tx({ id: 'b2', type: 'BUY', quantity: '1', unit_price: '70', trade_date: '2024-03-02' }),
    ];

    const ledger = computeLedger('asset-1', transactions, 'FIFO');

    expect(ledger.quantity.toFixed(10)).toBe('1.0000000000');
    expect(ledger.costBasisEur.toFixed(8)).toBe('70.00000000');
    expect(ledger.realizedPnlEur.toFixed(8)).toBe('20.00000000');
  });

  it('detecta ventas sin posición suficiente', () => {
    const transactions = [
      tx({ id: 's1', type: 'SELL', quantity: '5', unit_price: '100', trade_date: '2024-01-02' }),
    ];

    const ledger = computeLedger('asset-1', transactions, 'FIFO');

    expect(ledger.oversold).toHaveLength(1);
    expect(ledger.oversold[0]?.available.isZero()).toBe(true);
    expect(ledger.oversold[0]?.requested.toFixed(10)).toBe('5.0000000000');
    expect(ledger.quantity.isZero()).toBe(true);
  });
});

describe('computeLedger · coste medio', () => {
  it('usa el precio medio ponderado al vender', () => {
    const transactions = [
      tx({ id: 'b1', type: 'BUY', quantity: '10', unit_price: '100', trade_date: '2024-01-02' }),
      tx({ id: 'b2', type: 'BUY', quantity: '5', unit_price: '120', trade_date: '2024-02-01' }),
      tx({ id: 's1', type: 'SELL', quantity: '12', unit_price: '150', fees: '10', trade_date: '2024-03-01' }),
    ];

    const ledger = computeLedger('asset-1', transactions, 'AVERAGE');

    // Coste medio = 1600 / 15 = 106.6666667; 12 × 106.6666667 = 1280
    expect(ledger.quantity.toFixed(10)).toBe('3.0000000000');
    expect(ledger.costBasisEur.toFixed(8)).toBe('320.00000000');
    expect(ledger.avgCostEur.toFixed(8)).toBe('106.66666667');
    expect(ledger.realizedPnlEur.toFixed(8)).toBe('510.00000000');
  });

  it('incluye comisiones en el coste de compra y en el neto de venta', () => {
    const transactions = [
      tx({ id: 'b1', type: 'BUY', quantity: '100', unit_price: '10', fees: '5', trade_date: '2024-01-02' }),
      tx({ id: 's1', type: 'SELL', quantity: '40', unit_price: '12', fees: '2', trade_date: '2024-02-02' }),
    ];

    const ledger = computeLedger('asset-1', transactions, 'AVERAGE');

    // Coste total 1005 → medio 10.05; 40 × 10.05 = 402; neto 478; plusvalía 76
    expect(ledger.realizedPnlEur.toFixed(8)).toBe('76.00000000');
    expect(ledger.costBasisEur.toFixed(8)).toBe('603.00000000');
    expect(ledger.avgCostEur.toFixed(8)).toBe('10.05000000');
  });
});

describe('sortLedgerTransactions', () => {
  it('ordena por fecha, creación e id de forma estable', () => {
    const sorted = sortLedgerTransactions([
      tx({ id: 'c', type: 'BUY', quantity: '1', unit_price: '1', trade_date: '2024-01-02', created_at: '2024-01-02T10:00:00Z' }),
      tx({ id: 'a', type: 'BUY', quantity: '1', unit_price: '1', trade_date: '2024-01-01', created_at: '2024-01-01T10:00:00Z' }),
      tx({ id: 'b', type: 'BUY', quantity: '1', unit_price: '1', trade_date: '2024-01-02', created_at: '2024-01-02T09:00:00Z' }),
    ]);

    expect(sorted.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });
});
