import { useMemo, useState, useEffect, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import type {
  AssetRow,
  AssetType,
  Currency,
  Pagination,
  PortfolioResponse,
  TransactionType,
  TransactionView,
} from '@cartera/shared';
import { ASSET_TYPES, CURRENCIES, transactionCreateSchema } from '@cartera/shared';
import { useAuth } from '../app/providers';
import { PageHeader } from '../components/PageHeader';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Segmented,
  Select,
  Textarea,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';
import {
  ASSET_TYPE_LABELS,
  decimalInput,
  formatDate,
  money,
  price,
  quantity,
  signClass,
  today,
} from '../lib/format';

interface TransactionsResponse {
  data: TransactionView[];
  pagination: Pagination;
}

interface TransactionFormState {
  assetId: string;
  type: TransactionType;
  tradeDate: string;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: Currency;
  notes: string;
}

const emptyForm = (currency: Currency = 'EUR'): TransactionFormState => ({
  assetId: '',
  type: 'BUY',
  tradeDate: today(),
  quantity: '',
  unitPrice: '',
  fees: '0',
  currency,
  notes: '',
});

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'BUY', label: 'Compra' },
  { value: 'SELL', label: 'Venta' },
];

export const TransactionsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const base = user?.base_currency ?? 'EUR';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const assetParam = searchParams.get('asset');

  const [assetFilter, setAssetFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | TransactionType>('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionView | null>(null);
  const [form, setForm] = useState<TransactionFormState>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ data: AssetRow[] }>('/assets'),
  });
  const assets = assetsQuery.data?.data ?? [];

  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api.get<PortfolioResponse>('/portfolio'),
  });

  const transactionsQuery = useInfiniteQuery({
    queryKey: ['transactions', assetFilter, typeFilter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (assetFilter) params.set('asset_id', assetFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (pageParam) params.set('cursor', pageParam);
      return api.get<TransactionsResponse>(`/transactions?${params.toString()}`);
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
  });

  const transactions = useMemo(
    () => transactionsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [transactionsQuery.data],
  );

  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  const positionsByAsset = useMemo(
    () =>
      new Map(
        (portfolioQuery.data?.positions ?? []).map((position) => [
          position.asset.id,
          Number(position.quantity),
        ]),
      ),
    [portfolioQuery.data],
  );

  const openModal = () => {
    const currency = assets[0]?.currency ?? user?.base_currency ?? 'EUR';
    setEditing(null);
    setForm(emptyForm(currency));
    setErrors({});
    setMessage(null);
    setOpen(true);
  };

  const openEdit = (transaction: TransactionView) => {
    setEditing(transaction);
    setForm({
      assetId: transaction.asset_id,
      type: transaction.type,
      tradeDate: transaction.trade_date,
      quantity: decimalInput(transaction.quantity),
      unitPrice: decimalInput(transaction.unit_price),
      fees: decimalInput(transaction.fees),
      currency: transaction.currency,
      notes: transaction.notes ?? '',
    });
    setErrors({});
    setMessage(null);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
  };

  const patchForm = (patch: Partial<TransactionFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    await queryClient.invalidateQueries({ queryKey: ['history'] });
    await queryClient.invalidateQueries({ queryKey: ['allocation'] });
    await queryClient.invalidateQueries({ queryKey: ['performance'] });
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['dividends-summary'] });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const parsed = transactionCreateSchema.safeParse({
      asset_id: form.assetId,
      type: form.type,
      trade_date: form.tradeDate,
      quantity: form.quantity,
      unit_price: form.unitPrice,
      fees: form.fees === '' ? '0' : form.fees,
      currency: form.currency,
      notes: form.notes.trim() === '' ? undefined : form.notes.trim(),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/transactions/${editing.id}`, parsed.data);
      } else {
        await api.post('/transactions', parsed.data);
      }
      await invalidate();
      closeModal();
      setForm(emptyForm());
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(error.message);
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (transaction: TransactionView) => {
    const asset = assetsById.get(transaction.asset_id);
    const label = `${transaction.type === 'BUY' ? 'compra' : 'venta'} de ${
      asset?.symbol ?? 'activo'
    } del ${formatDate(transaction.trade_date)}`;
    if (!window.confirm(`¿Eliminar la ${label}? Se recalcularán las posiciones.`)) return;

    setDeletingId(transaction.id);
    try {
      await api.delete(`/transactions/${transaction.id}`);
      await invalidate();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const selectedAsset = assets.find((asset) => asset.id === form.assetId);
  const baseAvailable = selectedAsset ? positionsByAsset.get(selectedAsset.id) ?? 0 : 0;
  // Al editar, la posición actual ya incluye el efecto de esta operación. Se
  // descuenta para mostrar cuánto se podría vender con el cambio aplicado.
  const editingDelta =
    editing && editing.asset_id === form.assetId
      ? editing.type === 'SELL'
        ? Number(editing.quantity)
        : -Number(editing.quantity)
      : 0;
  const available = Math.max(0, baseAvailable + editingDelta);

  useEffect(() => {
    if (!assetParam) return;
    const asset = assets.find((a) => a.id === assetParam);
    if (asset) {
      openModal();
      setForm((current) => ({ ...current, assetId: asset.id, currency: asset.currency }));
      navigate('?', { replace: true });
    }
  }, [assetParam, assets, openModal, navigate]);

  const quickCurrency = form.currency || 'EUR';

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        title="Operaciones"
        description="Compras y ventas de acciones, ETF y criptomonedas. Las plusvalías se recalculan al instante con el método de coste de tu perfil."
        actions={
          <>
            <Link
              to="/activos"
              className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
            >
              Activos
            </Link>
            <Link
              to="/importar"
              className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
            >
              Importar CSV
            </Link>
            <Button variant="primary" onClick={openModal}>
              Nueva operación
            </Button>
          </>
        }
      />

      {message && !open ? <ErrorNote>{message}</ErrorNote> : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Activo" className="w-full sm:w-64">
            <Select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)}>
              <option value="">Todos los activos</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol} · {asset.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo" className="w-full sm:w-44">
            <Select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as '' | TransactionType)}
            >
              <option value="">Compras y ventas</option>
              <option value="BUY">Solo compras</option>
              <option value="SELL">Solo ventas</option>
            </Select>
          </Field>
          {assetFilter || typeFilter ? (
            <Button
              variant="subtle"
              onClick={() => {
                setAssetFilter('');
                setTypeFilter('');
              }}
            >
              Limpiar filtros
            </Button>
          ) : null}
          <p className="ml-auto text-xs text-muted">
            {transactions.length} {transactions.length === 1 ? 'movimiento' : 'movimientos'}
          </p>
        </div>
      </Card>

      {transactionsQuery.isPending ? (
        <LoadingBlock label="Cargando operaciones…" />
      ) : transactionsQuery.isError ? (
        <ErrorNote>No se pudieron cargar las operaciones.</ErrorNote>
      ) : transactions.length === 0 ? (
        <Card>
          <EmptyState
            title="Aún no hay operaciones"
            description={
              assets.length === 0
                ? 'Primero da de alta un activo (o créalo directamente al registrar la primera compra) y después anota la operación.'
                : 'Registra tu primera compra para empezar a calcular posiciones y plusvalías.'
            }
            action={
              <Button variant="primary" onClick={openModal}>
                Registrar operación
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Activo</th>
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-3 text-right font-medium">Precio</th>
                  <th className="px-3 py-3 text-right font-medium">Comisiones</th>
                  <th className="px-3 py-3 text-right font-medium">Importe neto</th>
                  <th className="px-3 py-3 text-right font-medium">P&L realizado</th>
                  <th className="px-5 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => {
                  const asset = assetsById.get(transaction.asset_id);
                  const isBuy = transaction.type === 'BUY';
                  return (
                    <tr
                      key={transaction.id}
                      className="border-b border-line/60 transition last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                        {formatDate(transaction.trade_date)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-ink">{asset?.symbol ?? '—'}</p>
                        <p className="max-w-[180px] truncate text-[11px] text-muted">
                          {asset?.name ?? 'Activo eliminado'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={isBuy ? 'accent' : 'down'}>{isBuy ? 'Compra' : 'Venta'}</Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular">{quantity(transaction.quantity)}</td>
                      <td className="px-3 py-3 text-right tabular">
                        {price(transaction.unit_price)}
                        <span className="block text-[11px] text-muted">{transaction.currency}</span>
                        {transaction.currency !== 'EUR' ? (
                          <span className="block text-[10px] text-muted/70">
                            1 {transaction.currency} = {price(transaction.fx_rate_eur)} EUR
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right tabular text-muted">
                        {money(transaction.fees, transaction.currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {money(transaction.net_amount_base, base)}
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {transaction.realized_pnl_base === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={signClass(transaction.realized_pnl_base)}>
                            {money(transaction.realized_pnl_base, base)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="subtle" size="sm" onClick={() => openEdit(transaction)}>
                            Editar
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deletingId === transaction.id}
                            onClick={() => void remove(transaction)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {transactionsQuery.hasNextPage ? (
            <div className="flex justify-center border-t border-line px-5 py-3">
              <Button
                variant="subtle"
                onClick={() => void transactionsQuery.fetchNextPage()}
                loading={transactionsQuery.isFetchingNextPage}
              >
                Cargar más
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title={editing ? 'Editar operación' : 'Nueva operación'}
        subtitle={
          editing
            ? 'Los cambios recalculan posiciones y plusvalías con el tipo de cambio del día.'
            : 'El tipo de cambio se toma automáticamente del día de la operación.'
        }
        wide
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="submit" form="transaction-form" variant="primary" loading={submitting}>
              {editing ? 'Guardar cambios' : 'Guardar operación'}
            </Button>
          </>
        }
      >
        <form id="transaction-form" onSubmit={submit} className="space-y-4" noValidate>
          {message ? <ErrorNote>{message}</ErrorNote> : null}

          <Field label="Tipo de operación">
            <Segmented
              options={TYPE_OPTIONS}
              value={form.type}
              onChange={(type) => patchForm({ type })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Activo" error={errors.asset_id} className="sm:col-span-2">
              <Select
                value={form.assetId}
                onChange={(event) => {
                  const asset = assets.find((item) => item.id === event.target.value);
                  patchForm({
                    assetId: event.target.value,
                    currency: asset?.currency ?? form.currency,
                  });
                }}
              >
                <option value="">Selecciona un activo…</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} · {asset.name} ({asset.currency})
                  </option>
                ))}
              </Select>
            </Field>

            {assets.length === 0 ? (
              <p className="sm:col-span-2 text-xs text-muted">
                No tienes activos todavía. Crea uno con el botón «Nuevo activo» o desde{' '}
                <Link to="/activos" className="text-accent hover:underline">
                  Activos
                </Link>
                .
              </p>
            ) : null}

            {form.type === 'SELL' && selectedAsset ? (
              <p className="sm:col-span-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                Posición disponible de {selectedAsset.symbol}:{' '}
                <span className="font-medium text-ink">{quantity(available)}</span>. No se permiten
                ventas en corto.
              </p>
            ) : null}

            <Field label="Fecha" error={errors.trade_date}>
              <Input
                type="date"
                max={today()}
                value={form.tradeDate}
                onChange={(event) => patchForm({ tradeDate: event.target.value })}
              />
            </Field>

            <Field label="Cantidad" error={errors.quantity}>
              <Input
                inputMode="decimal"
                placeholder="10"
                value={form.quantity}
                onChange={(event) => patchForm({ quantity: event.target.value })}
              />
            </Field>

            <Field label="Precio unitario" error={errors.unit_price}>
              <Input
                inputMode="decimal"
                placeholder="180,50"
                value={form.unitPrice}
                onChange={(event) => patchForm({ unitPrice: event.target.value })}
              />
            </Field>

            <Field label="Comisiones" error={errors.fees} hint="En la divisa de la operación.">
              <Input
                inputMode="decimal"
                placeholder="0"
                value={form.fees}
                onChange={(event) => patchForm({ fees: event.target.value })}
              />
            </Field>

            <Field label="Divisa" error={errors.currency}>
              <Select
                value={form.currency}
                onChange={(event) => patchForm({ currency: event.target.value as Currency })}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Notas" error={errors.notes} className="sm:col-span-2">
              <Textarea
                placeholder="Opcional: broker, motivo, referencia…"
                value={form.notes}
                onChange={(event) => patchForm({ notes: event.target.value })}
              />
            </Field>
          </div>

          <QuickAsset
            currency={quickCurrency}
            onCreated={(asset) => {
              void queryClient.invalidateQueries({ queryKey: ['assets'] });
              patchForm({ assetId: asset.id, currency: asset.currency });
            }}
          />
        </form>
      </Modal>
    </div>
  );
};

/** Alta mínima de activo sin salir del formulario de operación. */
const QuickAsset = ({
  currency,
  onCreated,
}: {
  currency: Currency;
  onCreated: (asset: AssetRow) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('STOCK');
  const [assetCurrency, setAssetCurrency] = useState<Currency>(currency);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <div className="rounded-lg border border-dashed border-line px-3 py-2.5">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setAssetCurrency(currency);
          }}
          className="text-xs font-medium text-accent hover:underline"
        >
          + Nuevo activo
        </button>
        <span className="ml-2 text-xs text-muted">
          Si el valor todavía no está en tu catálogo.
        </span>
      </div>
    );
  }

  const create = async () => {
    setError(null);
    if (symbol.trim().length === 0 || name.trim().length === 0) {
      setError('Indica el símbolo y el nombre del activo.');
      return;
    }
    setSaving(true);
    try {
      const asset = await api.post<AssetRow>('/assets', {
        symbol: symbol.trim(),
        name: name.trim(),
        asset_type: assetType,
        currency: assetCurrency,
      });
      onCreated(asset);
      setSymbol('');
      setName('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="mb-2 text-xs font-semibold text-ink">Crear activo rápido</p>
      {error ? <div className="mb-2"><ErrorNote>{error}</ErrorNote></div> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="Símbolo (AAPL, BTC-USD…)"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
        />
        <Input
          placeholder="Nombre"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Select
          value={assetType}
          onChange={(event) => setAssetType(event.target.value as AssetType)}
        >
          {ASSET_TYPES.map((type) => (
            <option key={type} value={type}>
              {ASSET_TYPE_LABELS[type] ?? type}
            </option>
          ))}
        </Select>
        <Select
          value={assetCurrency}
          onChange={(event) => setAssetCurrency(event.target.value as Currency)}
        >
          {CURRENCIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="button" variant="subtle" size="sm" loading={saving} onClick={() => void create()}>
          Crear y seleccionar
        </Button>
      </div>
    </div>
  );
};

