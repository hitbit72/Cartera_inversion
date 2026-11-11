import { describe, expect, it } from 'vitest';
import { D } from '../src/lib/decimal.js';
import { xirr, twrPercent } from '../src/services/calculations/performance.js';

describe('xirr', () => {
  it('calcula una TIR anual del 10 % en un año exacto', () => {
    const result = xirr([
      { date: '2025-01-01', amount: D(-1000) },
      { date: '2026-01-01', amount: D(1100) },
    ]);

    expect(result).not.toBeNull();
    expect(Number(result!.toFixed(2))).toBeCloseTo(10, 1);
  });

  it('tiene en cuenta varios flujos intermedios', () => {
    // −1000 inicial, +600 a los 6 meses, +600 a los 12 meses.
    const result = xirr([
      { date: '2025-01-01', amount: D(-1000) },
      { date: '2025-07-01', amount: D(600) },
      { date: '2026-01-01', amount: D(600) },
    ]);

    // La TIR debe ser positiva y superior al 20 %.
    expect(result).not.toBeNull();
    expect(result!.gt(20)).toBe(true);
  });

  it('devuelve null sin flujos positivos o negativos', () => {
    expect(xirr([{ date: '2025-01-01', amount: D(-100) }])).toBeNull();
    expect(
      xirr([
        { date: '2025-01-01', amount: D(100) },
        { date: '2025-02-01', amount: D(50) },
      ]),
    ).toBeNull();
  });
});

describe('twrPercent', () => {
  it('calcula la variación del índice TWR', () => {
    const series = [
      { date: '2025-01-01', market_value: '0', net_contributions: '0', dividends_cum: '0', total_value: '0', twr_index: '100.00', benchmark_index: null },
      { date: '2025-06-01', market_value: '0', net_contributions: '0', dividends_cum: '0', total_value: '0', twr_index: '110.00', benchmark_index: null },
    ];

    expect(twrPercent(series)).toBe('10.00');
  });

  it('devuelve 0 con menos de dos puntos', () => {
    expect(twrPercent([])).toBe('0.00');
  });
});
