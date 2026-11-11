import type { HistoryPoint } from '@cartera/shared';
import { D, percent, type Decimal } from '../../lib/decimal.js';
import { daysBetween } from '../../lib/dates.js';

export interface CashFlow {
  date: string;
  amount: Decimal;
}

/**
 * TIR ponderada por dinero. Se resuelve por bisección (robusta frente a
 * derivadas cercanas a cero). Devuelve porcentaje o null si no hay solución.
 */
export const xirr = (flows: CashFlow[]): Decimal | null => {
  const valid = flows.filter((flow) => !flow.amount.isZero());
  const hasPositive = valid.some((flow) => flow.amount.gt(0));
  const hasNegative = valid.some((flow) => flow.amount.lt(0));

  if (valid.length < 2 || !hasPositive || !hasNegative) return null;

  const sorted = [...valid].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const start = sorted[0]!.date;

  const points = sorted.map((flow) => ({
    years: daysBetween(start, flow.date) / 365,
    amount: flow.amount.toNumber(),
  }));

  if (points.every((point) => point.years === 0)) return null;

  const npv = (rate: number): number =>
    points.reduce((total, point) => total + point.amount / Math.pow(1 + rate, point.years), 0);

  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low);
  let highValue = npv(high);

  if (lowValue * highValue > 0) {
    high = 1000;
    highValue = npv(high);
    if (lowValue * highValue > 0) return null;
  }

  let mid = 0;
  for (let iteration = 0; iteration < 300; iteration += 1) {
    mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-7) break;
    if (lowValue * value <= 0) {
      high = mid;
      highValue = value;
    } else {
      low = mid;
      lowValue = value;
    }
  }

  if (!Number.isFinite(mid)) return null;
  return D(mid).mul(100);
};

/** Variación porcentual del índice TWR entre el primer y el último punto. */
export const twrPercent = (series: HistoryPoint[]): string => {
  if (series.length < 2) return '0.00';
  const first = D(series[0]!.twr_index);
  const last = D(series[series.length - 1]!.twr_index);
  if (first.isZero()) return '0.00';
  return percent(last.minus(first), first);
};
