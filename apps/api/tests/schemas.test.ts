import { describe, expect, it } from 'vitest';
import {
  assetCreateSchema,
  dividendCreateSchema,
  loginSchema,
  profilePatchSchema,
  registerSchema,
  transactionCreateSchema,
  transactionPatchSchema,
  transactionsQuerySchema,
} from '@cartera/shared';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';

describe('esquemas compartidos', () => {
  it('exige importes como cadenas decimales, no como números JSON', () => {
    const numeric = transactionCreateSchema.safeParse({
      asset_id: ASSET_ID,
      type: 'BUY',
      trade_date: '2024-01-02',
      quantity: 10,
      unit_price: '100.5',
      currency: 'USD',
    });

    expect(numeric.success).toBe(false);

    const asString = transactionCreateSchema.safeParse({
      asset_id: ASSET_ID,
      type: 'BUY',
      trade_date: '2024-01-02',
      quantity: '10',
      unit_price: '100.5',
      currency: 'USD',
    });

    expect(asString.success).toBe(true);
    if (asString.success) expect(asString.data.fees).toBe('0');
  });

  it('rechaza fechas futuras y cantidades no positivas', () => {
    const future = transactionCreateSchema.safeParse({
      asset_id: ASSET_ID,
      type: 'BUY',
      trade_date: '2999-01-01',
      quantity: '1',
      unit_price: '1',
      currency: 'EUR',
    });
    expect(future.success).toBe(false);

    const zero = transactionCreateSchema.safeParse({
      asset_id: ASSET_ID,
      type: 'BUY',
      trade_date: '2024-01-02',
      quantity: '0',
      unit_price: '1',
      currency: 'EUR',
    });
    expect(zero.success).toBe(false);
  });

  it('impide que la retención supere el importe bruto', () => {
    const result = dividendCreateSchema.safeParse({
      asset_id: ASSET_ID,
      payment_date: '2024-01-02',
      gross_amount: '10',
      withholding_tax: '11',
      currency: 'EUR',
    });

    expect(result.success).toBe(false);
  });

  it('normaliza símbolos y rechaza campos desconocidos', () => {
    expect(assetCreateSchema.safeParse({
      symbol: 'aapl',
      name: 'Apple Inc.',
      asset_type: 'STOCK',
      currency: 'USD',
    }).success).toBe(true);

    const strict = assetCreateSchema.safeParse({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      asset_type: 'STOCK',
      currency: 'USD',
      unexpected: true,
    });
    expect(strict.success).toBe(false);
  });

  it('valida perfil, login y registro', () => {
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
    expect(profilePatchSchema.safeParse({ base_currency: 'USD' }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ base_currency: 'BTC' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'A@B.COM ', password: 'x' }).success).toBe(true);
    expect(registerSchema.safeParse({ token: 't'.repeat(32), display_name: 'Ana', password: 'corta' }).success).toBe(false);
  });

  it('permite editar una operación con un solo campo', () => {
    const soloNotas = transactionPatchSchema.safeParse({ notes: 'Revisada' });
    expect(soloNotas.success).toBe(true);
    // La edición parcial no debe inyectar comisiones a cero.
    if (soloNotas.success) expect(soloNotas.data).toEqual({ notes: 'Revisada' });

    expect(transactionPatchSchema.safeParse({ quantity: '2' }).success).toBe(true);
    expect(transactionPatchSchema.safeParse({}).success).toBe(false);
  });

  it('convierte y acota los parámetros de paginación', () => {
    const parsed = transactionsQuerySchema.safeParse({ limit: '25' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.limit).toBe(25);

    expect(transactionsQuerySchema.safeParse({ limit: '5000' }).success).toBe(false);
  });
});
