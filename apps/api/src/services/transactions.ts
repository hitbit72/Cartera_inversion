import { randomUUID } from 'node:crypto';
import type {
  AssetRow,
  ProfileRow,
  TransactionCreateInput,
  TransactionPatchInput,
  TransactionsQuery,
  TransactionView,
} from '@cartera/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, notFound, unprocessable } from '../lib/errors.js';
import { dbFail } from '../lib/db.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { money, D, type Decimal } from '../lib/decimal.js';
import { getAsset } from './assets.js';
import { baseRateOn, baseRateSeries } from './base-rate.js';
import { computeLedger, type TransactionComputation } from './calculations/ledger.js';
import { resolveFx, type FxResolution } from './fx.js';
import { marketService, type MarketService } from './market/service.js';
import { loadAccount } from './profile.js';

const loadAssetTransactions = async (
  client: SupabaseClient,
  userId: string,
  assetId: string,
): Promise<import('@cartera/shared').TransactionRow[]> => {
  const { data, error } = await client
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('asset_id', assetId)
    .order('trade_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) dbFail(error, 'loadAssetTransactions');
  return (data ?? []) as import('@cartera/shared').TransactionRow[];
};

const toView = (
  row: import('@cartera/shared').TransactionRow,
  computation: TransactionComputation | undefined,
  baseRate: Decimal,
): TransactionView => {
  const divisor = baseRate.isZero() ? D(1) : baseRate;
  const amount = computation?.amountEur ?? D(0);
  const fees = computation?.feesEur ?? D(0);
  const net = computation?.netEur ?? D(0);
  const realized = computation?.realizedPnlEur ?? null;

  return {
    id: row.id,
    asset_id: row.asset_id,
    type: row.type,
    trade_date: row.trade_date,
    quantity: row.quantity,
    unit_price: row.unit_price,
    fees: row.fees,
    currency: row.currency,
    fx_rate_eur: row.fx_rate_eur,
    fx_rate_date: row.fx_rate_date,
    fx_rate_source: row.fx_rate_source,
    amount_base: money(amount.div(divisor)),
    fees_base: money(fees.div(divisor)),
    net_amount_base: money(net.div(divisor)),
    realized_pnl_base: realized === null ? null : money(realized.div(divisor)),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const insufficientPosition = (asset: AssetRow, requested: Decimal, available: Decimal): AppError =>
  unprocessable(
    'INSUFFICIENT_POSITION',
    `No puedes vender ${requested.toFixed(10)} ${asset.symbol}: solo tienes ${available.toFixed(10)}.`,
    [
      {
        field: 'quantity',
        message: `Supera la posición disponible (${available.toFixed(10)}).`,
      },
    ],
  );

export const getTransactionRow = async (
  client: SupabaseClient,
  userId: string,
  transactionId: string,
): Promise<import('@cartera/shared').TransactionRow> => {
  const { data, error } = await client
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) dbFail(error, 'getTransactionRow');
  if (!data) throw notFound('La operación no existe.');
  return data as import('@cartera/shared').TransactionRow;
};

const buildCandidate = (
  base: import('@cartera/shared').TransactionRow,
  input: TransactionPatchInput | TransactionCreateInput,
  fx: FxResolution,
): import('@cartera/shared').TransactionRow => ({
  ...base,
  asset_id: input.asset_id ?? base.asset_id,
  type: input.type ?? base.type,
  trade_date: input.trade_date ?? base.trade_date,
  quantity: input.quantity ?? base.quantity,
  unit_price: input.unit_price ?? base.unit_price,
  fees: input.fees ?? base.fees,
  currency: input.currency ?? base.currency,
  fx_rate_eur: fx.rate.toFixed(10),
  fx_rate_date: fx.date,
  fx_rate_source: fx.source,
  notes: input.notes !== undefined ? input.notes : base.notes,
});

export const createTransaction = async (
  client: SupabaseClient,
  profile: ProfileRow,
  input: TransactionCreateInput,
  market: MarketService = marketService,
): Promise<TransactionView> => {
  const asset = await getAsset(client, profile.id, input.asset_id);
  const account = await loadAccount(client, profile.id);
  const fx = await resolveFx(input.currency, input.trade_date, input.fx_rate_eur, market);

  const now = new Date().toISOString();
  const candidate: import('@cartera/shared').TransactionRow = {
    id: randomUUID(),
    user_id: profile.id,
    account_id: account.id,
    asset_id: input.asset_id,
    type: input.type,
    trade_date: input.trade_date,
    quantity: input.quantity,
    unit_price: input.unit_price,
    fees: input.fees,
    currency: input.currency,
    fx_rate_eur: fx.rate.toFixed(10),
    fx_rate_date: fx.date,
    fx_rate_source: fx.source,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };

  const existing = await loadAssetTransactions(client, profile.id, asset.id);
  const ledger = computeLedger(asset.id, [...existing, candidate], profile.cost_method);

  if (ledger.oversold.length > 0) {
    const event = ledger.oversold[0]!;
    throw insufficientPosition(asset, event.requested, event.available);
  }

  const { data, error } = await client
    .from('transactions')
    .insert({
      id: candidate.id,
      user_id: candidate.user_id,
      account_id: candidate.account_id,
      asset_id: candidate.asset_id,
      type: candidate.type,
      trade_date: candidate.trade_date,
      quantity: candidate.quantity,
      unit_price: candidate.unit_price,
      fees: candidate.fees,
      currency: candidate.currency,
      fx_rate_eur: candidate.fx_rate_eur,
      fx_rate_date: candidate.fx_rate_date,
      fx_rate_source: candidate.fx_rate_source,
      notes: candidate.notes,
      created_at: candidate.created_at,
    })
    .select('*')
    .single();

  if (error) dbFail(error, 'createTransaction');

  const row = data as import('@cartera/shared').TransactionRow;
  const baseRate = await baseRateOn(profile, row.fx_rate_date, market);

  return toView(row, ledger.transactions.get(row.id), baseRate);
};

export const updateTransaction = async (
  client: SupabaseClient,
  profile: ProfileRow,
  transactionId: string,
  input: TransactionPatchInput,
  market: MarketService = marketService,
): Promise<TransactionView> => {
  const existing = await getTransactionRow(client, profile.id, transactionId);

  const targetAsset = input.asset_id
    ? await getAsset(client, profile.id, input.asset_id)
    : await getAsset(client, profile.id, existing.asset_id);

  const nextCurrency = input.currency ?? existing.currency;
  const nextDate = input.trade_date ?? existing.trade_date;

  let fx: FxResolution;
  if (input.fx_rate_eur !== undefined) {
    fx = { rate: D(input.fx_rate_eur), date: nextDate, source: 'MANUAL' };
  } else if (input.currency !== undefined || input.trade_date !== undefined) {
    fx = await resolveFx(nextCurrency, nextDate, undefined, market);
  } else {
    fx = {
      rate: D(existing.fx_rate_eur),
      date: existing.fx_rate_date,
      source: existing.fx_rate_source,
    };
  }

  const candidate = buildCandidate(existing, input, fx);

  const affectedAssetIds = new Set([existing.asset_id, candidate.asset_id]);
  for (const assetId of affectedAssetIds) {
    const asset = await getAsset(client, profile.id, assetId);
    const rows = await loadAssetTransactions(client, profile.id, assetId);
    const filtered = rows.filter((row) => row.id !== transactionId);
    const ledger = computeLedger(assetId, [...filtered, candidate].filter((row) => row.asset_id === assetId), profile.cost_method);

    if (ledger.oversold.length > 0) {
      const event = ledger.oversold[0]!;
      if (event.transactionId === transactionId && candidate.type === 'SELL') {
        throw insufficientPosition(asset, event.requested, event.available);
      }
      throw unprocessable(
        'INCONSISTENT_HISTORY',
        'El cambio dejaría ventas posteriores sin posición suficiente.',
      );
    }
  }

  const { data, error } = await client
    .from('transactions')
    .update({
      asset_id: candidate.asset_id,
      type: candidate.type,
      trade_date: candidate.trade_date,
      quantity: candidate.quantity,
      unit_price: candidate.unit_price,
      fees: candidate.fees,
      currency: candidate.currency,
      fx_rate_eur: candidate.fx_rate_eur,
      fx_rate_date: candidate.fx_rate_date,
      fx_rate_source: candidate.fx_rate_source,
      notes: candidate.notes,
    })
    .eq('id', transactionId)
    .eq('user_id', profile.id)
    .select('*')
    .maybeSingle();

  if (error) dbFail(error, 'updateTransaction');
  if (!data) throw notFound('La operación no existe.');

  const row = data as import('@cartera/shared').TransactionRow;
  const rows = await loadAssetTransactions(client, profile.id, row.asset_id);
  const ledger = computeLedger(row.asset_id, rows, profile.cost_method);
  const baseRate = await baseRateOn(profile, row.fx_rate_date, market);

  return toView(row, ledger.transactions.get(row.id), baseRate);
};

export const deleteTransaction = async (
  client: SupabaseClient,
  profile: ProfileRow,
  transactionId: string,
  market: MarketService = marketService,
): Promise<void> => {
  const existing = await getTransactionRow(client, profile.id, transactionId);
  const asset = await getAsset(client, profile.id, existing.asset_id);
  const rows = await loadAssetTransactions(client, profile.id, existing.asset_id);
  const ledger = computeLedger(
    existing.asset_id,
    rows.filter((row) => row.id !== transactionId),
    profile.cost_method,
  );

  if (ledger.oversold.length > 0) {
    void asset;
    throw new AppError(
      409,
      'INCONSISTENT_HISTORY',
      'No puedes borrar esta operación: dejaría ventas posteriores sin posición.',
    );
  }

  const { error } = await client
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', profile.id);

  if (error) dbFail(error, 'deleteTransaction');
};

export const listTransactions = async (
  client: SupabaseClient,
  profile: ProfileRow,
  query: TransactionsQuery,
  market: MarketService = marketService,
): Promise<{
  data: TransactionView[];
  pagination: { next_cursor: string | null; has_more: boolean };
}> => {
  let request = client.from('transactions').select('*').eq('user_id', profile.id);

  if (query.asset_id) request = request.eq('asset_id', query.asset_id);
  if (query.type) request = request.eq('type', query.type);
  if (query.from) request = request.gte('trade_date', query.from);
  if (query.to) request = request.lte('trade_date', query.to);

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    request = request.or(
      `trade_date.lt.${cursor.date},and(trade_date.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await request
    .order('trade_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1);

  if (error) dbFail(error, 'listTransactions');

  const rows = (data ?? []) as import('@cartera/shared').TransactionRow[];
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  // Para calcular la plusvalía realizada de cada venta hace falta el histórico
  // completo del activo, no solo la página.
  const assetIds = Array.from(new Set(page.map((row) => row.asset_id)));
  const { data: allData, error: allError } = await client
    .from('transactions')
    .select('*')
    .eq('user_id', profile.id)
    .in('asset_id', assetIds.length > 0 ? assetIds : ['00000000-0000-0000-0000-000000000000'])
    .order('trade_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (allError) dbFail(allError, 'listTransactions/history');

  const allRows = (allData ?? []) as import('@cartera/shared').TransactionRow[];
  const ledgers = new Map<string, ReturnType<typeof computeLedger>>();
  for (const assetId of assetIds) {
    ledgers.set(
      assetId,
      computeLedger(assetId, allRows.filter((row) => row.asset_id === assetId), profile.cost_method),
    );
  }

  const dates = allRows.map((row) => row.fx_rate_date).sort();
  const baseRateFor =
    dates.length > 0
      ? await baseRateSeries(profile, dates[0]!, dates[dates.length - 1]!, market)
      : () => D(1);

  const views = page.map((row) => {
    const ledger = ledgers.get(row.asset_id);
    return toView(row, ledger?.transactions.get(row.id), baseRateFor(row.fx_rate_date));
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.trade_date, last.id) : null;

  return { data: views, pagination: { next_cursor: nextCursor, has_more: hasMore } };
};

export const getTransactionView = async (
  client: SupabaseClient,
  profile: ProfileRow,
  transactionId: string,
  market: MarketService = marketService,
): Promise<TransactionView> => {
  const row = await getTransactionRow(client, profile.id, transactionId);
  const rows = await loadAssetTransactions(client, profile.id, row.asset_id);
  const ledger = computeLedger(row.asset_id, rows, profile.cost_method);
  const baseRate = await baseRateOn(profile, row.fx_rate_date, market);
  return toView(row, ledger.transactions.get(row.id), baseRate);
};
