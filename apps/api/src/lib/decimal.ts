import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30 });

export { Decimal };

export type Numeric = Decimal.Value;

export const D = (value: Numeric | null | undefined): Decimal =>
  value === null || value === undefined || value === '' ? new Decimal(0) : new Decimal(value);

export const ZERO = new Decimal(0);

/** Importes monetarios: 8 decimales, como las columnas numeric(20,8). */
export const money = (value: Numeric): string => D(value).toFixed(8);

/** Cantidades: 10 decimales, como numeric(28,10). */
export const quantity = (value: Numeric): string => D(value).toFixed(10);

/** Tipos de cambio: 10 decimales, como numeric(20,10). */
export const rate = (value: Numeric): string => D(value).toFixed(10);

/** Porcentajes con dos decimales; 0 si el denominador es cero. */
export const percent = (numerator: Numeric, denominator: Numeric): string => {
  const den = D(denominator);
  if (den.isZero()) return '0.00';
  return D(numerator).div(den).mul(100).toFixed(2);
};

export const pct = (value: Numeric): string => D(value).toFixed(2);

export const sumDecimals = (values: Iterable<Numeric>): Decimal => {
  let total = ZERO;
  for (const value of values) total = total.plus(D(value));
  return total;
};

export const maxZero = (value: Decimal): Decimal => (value.isNegative() ? ZERO : value);
