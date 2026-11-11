import type { AssetCreateInput, AssetPatchInput, AssetRow } from '@cartera/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbFail, pgCode } from '../lib/db.js';
import { conflict, notFound, validationError } from '../lib/errors.js';

const normalizeNullable = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value.trim();

export const listAssets = async (
  client: SupabaseClient,
  userId: string,
  filters: { search?: string; type?: string },
): Promise<AssetRow[]> => {
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('user_id', userId)
    .order('symbol', { ascending: true });

  if (error) dbFail(error, 'listAssets');

  let rows = (data ?? []) as AssetRow[];

  if (filters.type) rows = rows.filter((asset) => asset.asset_type === filters.type);
  if (filters.search) {
    const term = filters.search.toLowerCase();
    rows = rows.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(term) || asset.name.toLowerCase().includes(term),
    );
  }

  return rows.slice(0, 500);
};

export const getAsset = async (
  client: SupabaseClient,
  userId: string,
  assetId: string,
): Promise<AssetRow> => {
  const { data, error } = await client
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) dbFail(error, 'getAsset');
  if (!data) throw notFound('El activo no existe.');
  return data as AssetRow;
};

export const createAsset = async (
  client: SupabaseClient,
  userId: string,
  input: AssetCreateInput,
): Promise<AssetRow> => {
  const priceMode = input.price_mode ?? 'AUTO';
  const manualPrice = normalizeNullable(input.manual_price);
  const manualCurrency = normalizeNullable(input.manual_price_currency);

  const { data, error } = await client
    .from('assets')
    .insert({
      user_id: userId,
      symbol: input.symbol,
      name: input.name,
      asset_type: input.asset_type,
      sector: normalizeNullable(input.sector),
      country: normalizeNullable(input.country),
      currency: input.currency,
      exchange: normalizeNullable(input.exchange),
      isin: normalizeNullable(input.isin),
      price_mode: priceMode,
      manual_price: manualPrice,
      manual_price_currency: manualCurrency,
      manual_price_at: priceMode === 'MANUAL' ? new Date().toISOString() : null,
      notes: normalizeNullable(input.notes),
    })
    .select('*')
    .single();

  if (error) {
    if (pgCode(error) === '23505') {
      throw conflict('DUPLICATE_ASSET', 'Ya tienes un activo con ese símbolo.');
    }
    dbFail(error, 'createAsset');
  }

  return data as AssetRow;
};

export const updateAsset = async (
  client: SupabaseClient,
  userId: string,
  assetId: string,
  input: AssetPatchInput,
): Promise<AssetRow> => {
  const existing = await getAsset(client, userId, assetId);

  const priceMode = input.price_mode ?? existing.price_mode;
  const manualPrice =
    input.manual_price !== undefined
      ? normalizeNullable(input.manual_price)
      : existing.manual_price;
  const manualCurrency =
    input.manual_price_currency !== undefined
      ? normalizeNullable(input.manual_price_currency)
      : existing.manual_price_currency;

  if (priceMode === 'MANUAL' && (!manualPrice || !manualCurrency)) {
    throw validationError([
      { field: 'manual_price', message: 'El modo MANUAL exige precio y divisa manuales.' },
    ]);
  }

  const manualChanged =
    input.manual_price !== undefined ||
    input.manual_price_currency !== undefined ||
    input.price_mode !== undefined;

  const patch: Record<string, unknown> = {};
  if (input.symbol !== undefined) patch.symbol = input.symbol;
  if (input.name !== undefined) patch.name = input.name;
  if (input.asset_type !== undefined) patch.asset_type = input.asset_type;
  if (input.sector !== undefined) patch.sector = normalizeNullable(input.sector);
  if (input.country !== undefined) patch.country = normalizeNullable(input.country);
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.exchange !== undefined) patch.exchange = normalizeNullable(input.exchange);
  if (input.isin !== undefined) patch.isin = normalizeNullable(input.isin);
  if (input.notes !== undefined) patch.notes = normalizeNullable(input.notes);
  if (input.price_mode !== undefined) patch.price_mode = priceMode;
  if (input.manual_price !== undefined) patch.manual_price = manualPrice;
  if (input.manual_price_currency !== undefined) patch.manual_price_currency = manualCurrency;
  if (manualChanged) {
    patch.manual_price_at = priceMode === 'MANUAL' ? new Date().toISOString() : null;
  }
  if (priceMode === 'AUTO' && input.price_mode === 'AUTO') {
    patch.manual_price = null;
    patch.manual_price_currency = null;
    patch.manual_price_at = null;
  }

  const { data, error } = await client
    .from('assets')
    .update(patch)
    .eq('id', assetId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    if (pgCode(error) === '23505') {
      throw conflict('DUPLICATE_ASSET', 'Ya tienes un activo con ese símbolo.');
    }
    dbFail(error, 'updateAsset');
  }
  if (!data) throw notFound('El activo no existe.');
  return data as AssetRow;
};

export const deleteAsset = async (
  client: SupabaseClient,
  userId: string,
  assetId: string,
): Promise<void> => {
  const { data, error } = await client
    .from('assets')
    .delete()
    .eq('id', assetId)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    if (pgCode(error) === '23503') {
      throw conflict('ASSET_IN_USE', 'El activo tiene operaciones o dividendos asociados.');
    }
    dbFail(error, 'deleteAsset');
  }
  if ((data ?? []).length === 0) throw notFound('El activo no existe.');
};
