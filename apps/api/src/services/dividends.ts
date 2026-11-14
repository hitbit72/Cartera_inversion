import type {
  CsvDividendRow,
  CsvImportResult,
  DividendCreateInput,
  DividendPatchInput,
  DividendsQuery,
  DividendRow,
  DividendView,
  ProfileRow,
} from '@cartera/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, notFound, unprocessable } from '../lib/errors.js';
import { dbFail } from '../lib/db.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { D, money, type Decimal } from '../lib/decimal.js';
import { getAsset } from './assets.js';
import { baseRateOn, baseRateSeries } from './base-rate.js';
import { resolveFx, type FxResolution } from './fx.js';
import { marketService, type MarketService } from './market/service.js';
import { loadAccount } from './profile.js';

const toView = (row: DividendRow, baseRate: Decimal): DividendView => {
  const divisor = baseRate.isZero() ? D(1) : baseRate;
  const netNative = D(row.gross_amount).minus(D(row.withholding_tax));
  const netEur = netNative.mul(D(row.fx_rate_eur));

  return {
    id: row.id,
    asset_id: row.asset_id,
    payment_date: row.payment_date,
    gross_amount: row.gross_amount,
    withholding_tax: row.withholding_tax,
    currency: row.currency,
    fx_rate_eur: row.fx_rate_eur,
    fx_rate_date: row.fx_rate_date,
    fx_rate_source: row.fx_rate_source,
    net_amount: money(netNative),
    net_amount_base: money(netEur.div(divisor)),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const assertWithholding = (gross: string, withholding: string): void => {
  if (D(withholding).gt(D(gross))) {
    throw unprocessable(
      'INVALID_WITHHOLDING',
      'La retención no puede superar el importe bruto.',
      [{ field: 'withholding_tax', message: 'Debe ser menor o igual que el importe bruto.' }],
    );
  }
};

const getDividendRow = async (
  client: SupabaseClient,
  userId: string,
  dividendId: string,
): Promise<DividendRow> => {
  const { data, error } = await client
    .from('dividends')
    .select('*')
    .eq('id', dividendId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) dbFail(error, 'getDividendRow');
  if (!data) throw notFound('El dividendo no existe.');
  return data as DividendRow;
};

export const createDividend = async (
  client: SupabaseClient,
  profile: ProfileRow,
  input: DividendCreateInput,
  market: MarketService = marketService,
): Promise<DividendView> => {
  await getAsset(client, profile.id, input.asset_id);
  const account = await loadAccount(client, profile.id);
  const fx = await resolveFx(input.currency, input.payment_date, input.fx_rate_eur, market);
  assertWithholding(input.gross_amount, input.withholding_tax);

  const { data, error } = await client
    .from('dividends')
    .insert({
      user_id: profile.id,
      account_id: account.id,
      asset_id: input.asset_id,
      payment_date: input.payment_date,
      gross_amount: input.gross_amount,
      withholding_tax: input.withholding_tax,
      currency: input.currency,
      fx_rate_eur: fx.rate.toFixed(10),
      fx_rate_date: fx.date,
      fx_rate_source: fx.source,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();

  if (error) dbFail(error, 'createDividend');

  const row = data as DividendRow;
  const baseRate = await baseRateOn(profile, row.fx_rate_date, market);
  return toView(row, baseRate);
};

export const updateDividend = async (
  client: SupabaseClient,
  profile: ProfileRow,
  dividendId: string,
  input: DividendPatchInput,
  market: MarketService = marketService,
): Promise<DividendView> => {
  const existing = await getDividendRow(client, profile.id, dividendId);

  if (input.asset_id) await getAsset(client, profile.id, input.asset_id);

  const nextCurrency = input.currency ?? existing.currency;
  const nextDate = input.payment_date ?? existing.payment_date;

  let fx: FxResolution;
  if (input.fx_rate_eur !== undefined) {
    fx = { rate: D(input.fx_rate_eur), date: nextDate, source: 'MANUAL' };
  } else if (input.currency !== undefined || input.payment_date !== undefined) {
    fx = await resolveFx(nextCurrency, nextDate, undefined, market);
  } else {
    fx = {
      rate: D(existing.fx_rate_eur),
      date: existing.fx_rate_date,
      source: existing.fx_rate_source,
    };
  }

  const gross = input.gross_amount ?? existing.gross_amount;
  const withholding = input.withholding_tax ?? existing.withholding_tax;
  assertWithholding(gross, withholding);

  const { data, error } = await client
    .from('dividends')
    .update({
      asset_id: input.asset_id ?? existing.asset_id,
      payment_date: nextDate,
      gross_amount: gross,
      withholding_tax: withholding,
      currency: nextCurrency,
      fx_rate_eur: fx.rate.toFixed(10),
      fx_rate_date: fx.date,
      fx_rate_source: fx.source,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    })
    .eq('id', dividendId)
    .eq('user_id', profile.id)
    .select('*')
    .maybeSingle();

  if (error) dbFail(error, 'updateDividend');
  if (!data) throw notFound('El dividendo no existe.');

  const row = data as DividendRow;
  const baseRate = await baseRateOn(profile, row.fx_rate_date, market);
  return toView(row, baseRate);
};

export const deleteDividend = async (
  client: SupabaseClient,
  profile: ProfileRow,
  dividendId: string,
): Promise<void> => {
  const { data, error } = await client
    .from('dividends')
    .delete()
    .eq('id', dividendId)
    .eq('user_id', profile.id)
    .select('id');

  if (error) dbFail(error, 'deleteDividend');
  if ((data ?? []).length === 0) throw notFound('El dividendo no existe.');
};

export const listDividends = async (
  client: SupabaseClient,
  profile: ProfileRow,
  query: DividendsQuery,
  market: MarketService = marketService,
): Promise<{
  data: DividendView[];
  pagination: { next_cursor: string | null; has_more: boolean };
}> => {
  let request = client.from('dividends').select('*').eq('user_id', profile.id);

  if (query.asset_id) request = request.eq('asset_id', query.asset_id);
  if (query.from) request = request.gte('payment_date', query.from);
  if (query.to) request = request.lte('payment_date', query.to);

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    request = request.or(
      `payment_date.lt.${cursor.date},and(payment_date.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await request
    .order('payment_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1);

  if (error) dbFail(error, 'listDividends');

  const rows = (data ?? []) as DividendRow[];
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  const dates = page.map((row) => row.fx_rate_date).sort();
  const baseRateFor =
    dates.length > 0
      ? await baseRateSeries(profile, dates[0]!, dates[dates.length - 1]!, market)
      : () => D(1);

  const last = page[page.length - 1];

  return {
    data: page.map((row) => toView(row, baseRateFor(row.fx_rate_date))),
    pagination: {
      next_cursor: hasMore && last ? encodeCursor(last.payment_date, last.id) : null,
      has_more: hasMore,
    },
  };
};

export const getDividendView = async (
  client: SupabaseClient,
  profile: ProfileRow,
  dividendId: string,
  market: MarketService = marketService,
): Promise<DividendView> => {
  const row = await getDividendRow(client, profile.id, dividendId);
  const baseRate = await baseRateOn(profile, row.fx_rate_date, market);
  return toView(row, baseRate);
};

/** Importa dividendos desde filas CSV. Resuelve cada símbolo al activo del
 *  usuario y crea los dividendos una a una (reutilizando createDividend).
 *  Las filas inválidas se registran como errores y no impiden importar el resto. */
export const importDividends = async (
  client: SupabaseClient,
  profile: ProfileRow,
  rows: CsvDividendRow[],
  market: MarketService = marketService,
): Promise<CsvImportResult> => {
  const { data: assets, error: assetsError } = await client
    .from('assets')
    .select('id, symbol, currency')
    .eq('user_id', profile.id);

  if (assetsError) dbFail(assetsError, 'importDividends/assets');

  const symbolToAsset = new Map(
    (assets ?? []).map((asset) => [asset.symbol.toUpperCase(), asset]),
  );

  const account = await loadAccount(client, profile.id);

  const errors: CsvImportResult['errors'] = [];
  let imported = 0;
  let skipped = 0;

  let rowNumber = 0;
  for (const row of rows) {
    rowNumber++;

    const asset = symbolToAsset.get(row.symbol.toUpperCase());
    if (!asset) {
      errors.push({ row: rowNumber, field: 'symbol', message: `Activo "${row.symbol}" no encontrado en tu catálogo.` });
      skipped++;
      continue;
    }

    const currency = row.currency ?? asset.currency;

    const input: DividendCreateInput = {
      asset_id: asset.id,
      payment_date: row.payment_date,
      gross_amount: row.gross_amount,
      withholding_tax: row.withholding_tax,
      currency,
      notes: row.notes ?? null,
    };

    try {
      await createDividend(client, profile, input, market);
      imported++;
    } catch (error) {
      skipped++;
      if (error instanceof AppError) {
        errors.push({ row: rowNumber, field: error.errors?.[0]?.field ?? null, message: error.message });
      } else if (error instanceof Error) {
        errors.push({ row: rowNumber, field: null, message: error.message });
      } else {
        errors.push({ row: rowNumber, field: null, message: 'Error inesperado al importar este dividendo.' });
      }
    }
  }

  return { imported, skipped, errors };
};

