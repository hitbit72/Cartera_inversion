import { z } from 'zod';
import {
  ALLOCATION_DIMENSIONS,
  ALLOCATION_METRICS,
  ASSET_TYPES,
  COST_METHODS,
  CURRENCIES,
  DEFAULT_PAGE_SIZE,
  DIVIDEND_GROUPS,
  HISTORY_INTERVALS,
  MAX_PAGE_SIZE,
  PRICE_MODES,
  THEMES,
  TRANSACTION_TYPES,
} from './constants.js';

// Mensajes por defecto de zod en español; los mensajes propios ya lo están.
z.config(z.locales.es());

/* ------------------------------------------------------------------ */
/* Primitivas                                                          */
/* ------------------------------------------------------------------ */

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, 'Debe ser una fecha válida en formato YYYY-MM-DD.');

export const notFutureDateSchema = isoDateSchema.refine(
  (value) => value <= todayUtc(),
  'La fecha no puede ser futura.',
);

/** Decimal como cadena: evita la pérdida de precisión de JSON number. */
function decimalString(options: {
  decimals: number;
  integerDigits: number;
  gt?: number;
  gte?: number;
  label: string;
}) {
  const { decimals, integerDigits, gt, gte, label } = options;
  const pattern = new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${decimals}})?$`);
  const schema = z
    .string()
    .trim()
    .regex(pattern, `${label} debe ser un decimal con máximo ${decimals} decimales.`);

  return schema.refine((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return false;
    if (gt !== undefined && !(parsed > gt)) return false;
    if (gte !== undefined && !(parsed >= gte)) return false;
    return true;
  }, `${label} está fuera del rango permitido.`);
}

export const moneySchema = (label = 'El importe') =>
  decimalString({ decimals: 8, integerDigits: 12, gte: 0, label });

export const positiveMoneySchema = (label = 'El importe') =>
  decimalString({ decimals: 8, integerDigits: 12, gt: 0, label });

export const quantitySchema = decimalString({
  decimals: 10,
  integerDigits: 18,
  gt: 0,
  label: 'La cantidad',
});

export const fxRateSchema = decimalString({
  decimals: 10,
  integerDigits: 10,
  gt: 0,
  label: 'El tipo de cambio',
});

export const countrySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, 'El país debe ser un código ISO de dos letras.'));

export const symbolSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9.^=-]+$/, 'El símbolo contiene caracteres no válidos.'));

export const isinSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, 'El ISIN no es válido.'));

export const currencySchema = z.enum(CURRENCIES);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .email('El correo no es válido.');

/** 12–72 caracteres. La comprobación de fortaleza se completa en el servicio. */
export const passwordSchema = z
  .string()
  .min(12, 'La contraseña debe tener al menos 12 caracteres.')
  .max(72, 'La contraseña no puede superar 72 caracteres.');

export const notesSchema = z.string().max(1000, 'Las notas no pueden superar 1000 caracteres.');

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

/* ------------------------------------------------------------------ */
/* Autenticación                                                       */
/* ------------------------------------------------------------------ */

export const registerSchema = z
  .object({
    token: z.string().trim().min(16).max(200),
    display_name: z.string().trim().min(1).max(80),
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(200),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z
  .object({
    access_token: z.string().min(16).max(4096),
    refresh_token: z.string().min(1).max(4096),
    new_password: passwordSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1).max(200),
    new_password: passwordSchema,
  })
  .strict();

export const profilePatchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).optional(),
    base_currency: currencySchema.optional(),
    cost_method: z.enum(COST_METHODS).optional(),
    benchmark_symbol: symbolSchema.nullable().optional(),
    theme: z.enum(THEMES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo.');

/* ------------------------------------------------------------------ */
/* Activos                                                             */
/* ------------------------------------------------------------------ */

export const assetCreateSchema = z
  .object({
    symbol: symbolSchema,
    name: z.string().trim().min(1).max(120),
    asset_type: z.enum(ASSET_TYPES),
    sector: z.string().trim().min(1).max(80).nullable().optional(),
    country: countrySchema.nullable().optional(),
    currency: currencySchema,
    exchange: z.string().trim().min(1).max(40).nullable().optional(),
    isin: isinSchema.nullable().optional(),
    price_mode: z.enum(PRICE_MODES).optional(),
    manual_price: positiveMoneySchema('El precio manual').nullable().optional(),
    manual_price_currency: currencySchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.price_mode === 'MANUAL') {
      if (!value.manual_price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['manual_price'],
          message: 'El precio manual es obligatorio en modo MANUAL.',
        });
      }
      if (!value.manual_price_currency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['manual_price_currency'],
          message: 'La divisa del precio manual es obligatoria.',
        });
      }
    }
  });

export const assetPatchSchema = z
  .object({
    symbol: symbolSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    asset_type: z.enum(ASSET_TYPES).optional(),
    sector: z.string().trim().min(1).max(80).nullable().optional(),
    country: countrySchema.nullable().optional(),
    currency: currencySchema.optional(),
    exchange: z.string().trim().min(1).max(40).nullable().optional(),
    isin: isinSchema.nullable().optional(),
    price_mode: z.enum(PRICE_MODES).optional(),
    manual_price: positiveMoneySchema('El precio manual').nullable().optional(),
    manual_price_currency: currencySchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo.');

export const assetsQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    type: z.enum(ASSET_TYPES).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

const transactionFields = {
  asset_id: z.string().uuid(),
  type: z.enum(TRANSACTION_TYPES),
  trade_date: notFutureDateSchema,
  quantity: quantitySchema,
  unit_price: moneySchema('El precio unitario'),
  fees: moneySchema('Las comisiones').default('0'),
  currency: currencySchema,
  fx_rate_eur: fxRateSchema.optional(),
  notes: notesSchema.nullable().optional(),
};

export const transactionCreateSchema = z.object(transactionFields).strict();

export const transactionPatchSchema = z
  .object({
    asset_id: transactionFields.asset_id.optional(),
    type: transactionFields.type.optional(),
    trade_date: transactionFields.trade_date.optional(),
    quantity: transactionFields.quantity.optional(),
    unit_price: transactionFields.unit_price.optional(),
    // Sin valor por defecto: en una edición parcial no debe inyectarse 0.
    fees: moneySchema('Las comisiones').optional(),
    currency: transactionFields.currency.optional(),
    fx_rate_eur: transactionFields.fx_rate_eur,
    notes: transactionFields.notes,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo.');

export const paginationQuerySchema = z
  .object({
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

export const transactionsQuerySchema = paginationQuerySchema.extend({
  asset_id: z.string().uuid().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* Dividendos                                                          */
/* ------------------------------------------------------------------ */

export const dividendCreateSchema = z
  .object({
    asset_id: z.string().uuid(),
    payment_date: notFutureDateSchema,
    gross_amount: positiveMoneySchema('El importe bruto'),
    withholding_tax: moneySchema('La retención').default('0'),
    currency: currencySchema,
    fx_rate_eur: fxRateSchema.optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Number(value.withholding_tax) <= Number(value.gross_amount), {
    path: ['withholding_tax'],
    message: 'La retención no puede superar el importe bruto.',
  });

export const dividendPatchSchema = z
  .object({
    asset_id: z.string().uuid().optional(),
    payment_date: notFutureDateSchema.optional(),
    gross_amount: positiveMoneySchema('El importe bruto').optional(),
    withholding_tax: moneySchema('La retención').optional(),
    currency: currencySchema.optional(),
    fx_rate_eur: fxRateSchema.optional(),
    notes: notesSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo.');

export const dividendsQuerySchema = paginationQuerySchema.extend({
  asset_id: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* Cartera                                                             */
/* ------------------------------------------------------------------ */

export const portfolioQuerySchema = z
  .object({
    include_closed: booleanish.optional(),
  })
  .strict();

export const historyQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    interval: z.enum(HISTORY_INTERVALS).default('1d'),
    benchmark: booleanish.default(true),
  })
  .strict();

export const allocationQuerySchema = z
  .object({
    dimension: z.enum(ALLOCATION_DIMENSIONS),
    metric: z.enum(ALLOCATION_METRICS).default('market_value'),
  })
  .strict();

export const performanceQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict();

export const dividendsSummaryQuerySchema = z
  .object({
    group_by: z.enum(DIVIDEND_GROUPS).default('year'),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Mercado                                                             */
/* ------------------------------------------------------------------ */

export const quotesQuerySchema = z
  .object({
    symbols: z
      .string()
      .trim()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.string().regex(/^[A-Z0-9.^=-]{1,20}$/))
          .min(1)
          .max(50, 'Máximo 50 símbolos por petición.'),
      ),
  })
  .strict();

export const marketHistoryQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    interval: z.enum(HISTORY_INTERVALS).default('1d'),
  })
  .strict();

export const fxQuerySchema = z
  .object({
    from: currencySchema,
    to: currencySchema,
    date: isoDateSchema.optional(),
  })
  .strict();

export const instrumentsQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(60),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Tipos inferidos                                                     */
/* ------------------------------------------------------------------ */

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
export type AssetCreateInput = z.infer<typeof assetCreateSchema>;
export type AssetPatchInput = z.infer<typeof assetPatchSchema>;
export type AssetsQuery = z.infer<typeof assetsQuerySchema>;
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type TransactionPatchInput = z.infer<typeof transactionPatchSchema>;
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
export type DividendCreateInput = z.infer<typeof dividendCreateSchema>;
export type DividendPatchInput = z.infer<typeof dividendPatchSchema>;
export type DividendsQuery = z.infer<typeof dividendsQuerySchema>;
export type PortfolioQuery = z.infer<typeof portfolioQuerySchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type AllocationQuery = z.infer<typeof allocationQuerySchema>;
export type PerformanceQuery = z.infer<typeof performanceQuerySchema>;
export type DividendsSummaryQuery = z.infer<typeof dividendsSummaryQuerySchema>;
export type QuotesQuery = z.infer<typeof quotesQuerySchema>;
export type MarketHistoryQuery = z.infer<typeof marketHistoryQuerySchema>;
export type FxQuery = z.infer<typeof fxQuerySchema>;
export type InstrumentsQuery = z.infer<typeof instrumentsQuerySchema>;
