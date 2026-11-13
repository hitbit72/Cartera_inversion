import { useMemo, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  AssetRow,
  Currency,
  DividendSummaryResponse,
  DividendView,
  Pagination,
} from '@cartera/shared';
import { CURRENCIES, dividendCreateSchema } from '@cartera/shared';
import { useAuth } from '../app/providers';
import { PageHeader } from '../components/PageHeader';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Segmented,
  Select,
  Stat,
  Textarea,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';
import { decimalInput, formatDate, money, price, today } from '../lib/format';

interface DividendsResponse {
  data: DividendView[];
  pagination: Pagination;
}

interface DividendFormState {
  assetId: string;
  paymentDate: string;
  gross: string;
  withholding: string;
  currency: Currency;
  notes: string;
}

const emptyForm = (currency: Currency = 'EUR'): DividendFormState => ({
  assetId: '',
  paymentDate: today(),
  gross: '',
  withholding: '0',
  currency,
  notes: '',
});

export const DividendsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const base = user?.base_currency ?? 'EUR';

  const [assetFilter, setAssetFilter] = useState('');
  const [groupBy, setGroupBy] = useState<'year' | 'asset'>('year');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DividendView | null>(null);
  const [form, setForm] = useState<DividendFormState>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ data: AssetRow[] }>('/assets'),
  });
  const assets = assetsQuery.data?.data ?? [];

  const summaryQuery = useQuery({
    queryKey: ['dividends-summary', groupBy],
    queryFn: () =>
      api.get<DividendSummaryResponse>(`/portfolio/dividends?group_by=${groupBy}`),
  });

  const dividendsQuery = useInfiniteQuery({
    queryKey: ['dividends', assetFilter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (assetFilter) params.set('asset_id', assetFilter);
      if (pageParam) params.set('cursor', pageParam);
      return api.get<DividendsResponse>(`/dividends?${params.toString()}`);
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
  });

  const dividends = useMemo(
    () => dividendsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [dividendsQuery.data],
  );

  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  const openModal = () => {
    const currency = assets[0]?.currency ?? user?.base_currency ?? 'EUR';
    setEditing(null);
    setForm(emptyForm(currency));
    setErrors({});
    setMessage(null);
    setOpen(true);
  };

  const openEdit = (dividend: DividendView) => {
    setEditing(dividend);
    setForm({
      assetId: dividend.asset_id,
      paymentDate: dividend.payment_date,
      gross: decimalInput(dividend.gross_amount),
      withholding: decimalInput(dividend.withholding_tax),
      currency: dividend.currency,
      notes: dividend.notes ?? '',
    });
    setErrors({});
    setMessage(null);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dividends'] });
    await queryClient.invalidateQueries({ queryKey: ['dividends-summary'] });
    await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    await queryClient.invalidateQueries({ queryKey: ['history'] });
    await queryClient.invalidateQueries({ queryKey: ['performance'] });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const parsed = dividendCreateSchema.safeParse({
      asset_id: form.assetId,
      payment_date: form.paymentDate,
      gross_amount: form.gross,
      withholding_tax: form.withholding === '' ? '0' : form.withholding,
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
        await api.patch(`/dividends/${editing.id}`, parsed.data);
      } else {
        await api.post('/dividends', parsed.data);
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

  const remove = async (dividend: DividendView) => {
    const asset = assetsById.get(dividend.asset_id);
    if (
      !window.confirm(
        `¿Eliminar el dividendo de ${asset?.symbol ?? 'activo'} del ${formatDate(
          dividend.payment_date,
        )}?`,
      )
    ) {
      return;
    }
    setDeletingId(dividend.id);
    try {
      await api.delete(`/dividends/${dividend.id}`);
      await invalidate();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const summaryItems = summaryQuery.data?.items ?? [];
  const maxSummary = Math.max(1, ...summaryItems.map((item) => Number(item.net)));

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        title="Dividendos"
        description="Importes brutos, retenciones y neto cobrado. Los dividendos se suman a la rentabilidad total de cada posición."
        actions={
          <>
            <Link
              to="/activos"
              className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
            >
              Activos
            </Link>
            <Button variant="primary" onClick={openModal}>
              Anotar dividendo
            </Button>
          </>
        }
      />

      {message && !open ? <ErrorNote>{message}</ErrorNote> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Bruto cobrado"
          value={money(summaryQuery.data?.total.gross, base)}
          hint="Antes de retenciones"
        />
        <Stat
          label="Retenciones"
          value={money(summaryQuery.data?.total.withholding, base)}
          hint="Impuestos retenidos en origen o destino"
        />
        <Stat
          label="Neto cobrado"
          value={money(summaryQuery.data?.total.net, base)}
          tone="text-up"
          hint="Lo que llega a tu bolsillo"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Dividendos por periodo"
            subtitle={
              groupBy === 'year'
                ? 'Neto cobrado agrupado por año.'
                : 'Neto cobrado por activo, de mayor a menor.'
            }
            actions={
              <Segmented<'year' | 'asset'>
                options={[
                  { value: 'year', label: 'Año' },
                  { value: 'asset', label: 'Activo' },
                ]}
                value={groupBy}
                onChange={setGroupBy}
                size="sm"
              />
            }
          />
          {summaryQuery.isPending ? (
            <LoadingBlock label="Calculando…" />
          ) : summaryItems.length === 0 ? (
            <EmptyState
              title="Sin dividendos"
              description="Anota el primer dividendo para ver su evolución aquí."
            />
          ) : (
            <ul className="space-y-2.5">
              {summaryItems.slice(0, 8).map((item) => (
                <li key={item.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-ink">{item.label}</span>
                    <span className="tabular text-muted">
                      {money(item.net, base)}
                      <span className="ml-2 text-[10px] text-muted/70">
                        bruto {money(item.gross, base)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(Number(item.net) / maxSummary) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Cómo se aplican" />
          <ul className="space-y-3 text-xs leading-relaxed text-muted">
            <li>
              <span className="font-medium text-ink">Importe bruto</span> es lo que paga la empresa
              por acción antes de impuestos.
            </li>
            <li>
              <span className="font-medium text-ink">Retención</span> es la parte que se queda
              Hacienda o el país de origen. No puede superar el bruto.
            </li>
            <li>
              <span className="font-medium text-ink">Divisa</span>: el dividendo se convierte a {base}{' '}
              con el tipo de cambio del día del cobro.
            </li>
            <li>
              El <span className="font-medium text-ink">neto</span> se suma a las plusvalías para
              calcular tu rendimiento total.
            </li>
          </ul>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Activo" className="w-full sm:w-72">
            <Select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value)}>
              <option value="">Todos los activos</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol} · {asset.name}
                </option>
              ))}
            </Select>
          </Field>
          {assetFilter ? (
            <Button variant="subtle" onClick={() => setAssetFilter('')}>
              Limpiar filtro
            </Button>
          ) : null}
          <p className="ml-auto text-xs text-muted">
            {dividends.length} {dividends.length === 1 ? 'dividendo' : 'dividendos'}
          </p>
        </div>
      </Card>

      {dividendsQuery.isPending ? (
        <LoadingBlock label="Cargando dividendos…" />
      ) : dividendsQuery.isError ? (
        <ErrorNote>No se pudieron cargar los dividendos.</ErrorNote>
      ) : dividends.length === 0 ? (
        <Card>
          <EmptyState
            title="Aún no hay dividendos anotados"
            description="Registra los cobros para que cuenten en el rendimiento total. Si cobras en otra divisa, se convierte automáticamente a tu divisa base."
            action={
              <Button variant="primary" onClick={openModal}>
                Anotar dividendo
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-medium">Cobro</th>
                  <th className="px-3 py-3 font-medium">Activo</th>
                  <th className="px-3 py-3 text-right font-medium">Bruto</th>
                  <th className="px-3 py-3 text-right font-medium">Retención</th>
                  <th className="px-3 py-3 text-right font-medium">Neto</th>
                  <th className="px-3 py-3 text-right font-medium">Neto en {base}</th>
                  <th className="px-5 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((dividend) => {
                  const asset = assetsById.get(dividend.asset_id);
                  return (
                    <tr
                      key={dividend.id}
                      className="border-b border-line/60 transition last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                        {formatDate(dividend.payment_date)}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-ink">{asset?.symbol ?? '—'}</p>
                        <p className="max-w-[180px] truncate text-[11px] text-muted">
                          {asset?.name ?? 'Activo eliminado'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {money(dividend.gross_amount, dividend.currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular text-down">
                        {money(dividend.withholding_tax, dividend.currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular font-medium">
                        {money(dividend.net_amount, dividend.currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {money(dividend.net_amount_base, base)}
                        {dividend.currency !== 'EUR' ? (
                          <span className="block text-[10px] text-muted/70">
                            1 {dividend.currency} = {price(dividend.fx_rate_eur)} EUR
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="subtle" size="sm" onClick={() => openEdit(dividend)}>
                            Editar
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deletingId === dividend.id}
                            onClick={() => void remove(dividend)}
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

          {dividendsQuery.hasNextPage ? (
            <div className="flex justify-center border-t border-line px-5 py-3">
              <Button
                variant="subtle"
                onClick={() => void dividendsQuery.fetchNextPage()}
                loading={dividendsQuery.isFetchingNextPage}
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
        title={editing ? 'Editar dividendo' : 'Anotar dividendo'}
        subtitle={
          editing
            ? 'Los cambios recalculan el neto y el rendimiento con el tipo de cambio del día.'
            : 'El tipo de cambio se toma automáticamente del día del cobro.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="submit" form="dividend-form" variant="primary" loading={submitting}>
              {editing ? 'Guardar cambios' : 'Guardar dividendo'}
            </Button>
          </>
        }
      >
        <form id="dividend-form" onSubmit={submit} className="space-y-4" noValidate>
          {message ? <ErrorNote>{message}</ErrorNote> : null}

          <Field label="Activo" error={errors.asset_id}>
            <Select
              value={form.assetId}
              onChange={(event) => {
                const asset = assets.find((item) => item.id === event.target.value);
                setForm((current) => ({
                  ...current,
                  assetId: event.target.value,
                  currency: asset?.currency ?? current.currency,
                }));
              }}
            >
              <option value="">Selecciona un activo…</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol} · {asset.name} ({asset.currency})
                </option>
              ))}
            </Select>
            {assets.length === 0 ? (
              <span className="mt-1 block text-xs text-muted">
                Crea primero un activo en{' '}
                <Link to="/activos" className="text-accent hover:underline">
                  Activos
                </Link>
                .
              </span>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha de cobro" error={errors.payment_date}>
              <Input
                type="date"
                max={today()}
                value={form.paymentDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, paymentDate: event.target.value }))
                }
              />
            </Field>

            <Field label="Divisa" error={errors.currency}>
              <Select
                value={form.currency}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    currency: event.target.value as Currency,
                  }))
                }
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Importe bruto" error={errors.gross_amount}>
              <Input
                inputMode="decimal"
                placeholder="12,00"
                value={form.gross}
                onChange={(event) =>
                  setForm((current) => ({ ...current, gross: event.target.value }))
                }
              />
            </Field>

            <Field
              label="Retención"
              error={errors.withholding_tax}
              hint="No puede superar el importe bruto."
            >
              <Input
                inputMode="decimal"
                placeholder="0"
                value={form.withholding}
                onChange={(event) =>
                  setForm((current) => ({ ...current, withholding: event.target.value }))
                }
              />
            </Field>

            <Field label="Notas" error={errors.notes} className="sm:col-span-2">
              <Textarea
                placeholder="Opcional: país de origen, broker…"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
};
