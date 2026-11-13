import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssetRow, AssetType, Currency, Instrument } from '@cartera/shared';
import {
  ASSET_TYPES,
  CURRENCIES,
  assetCreateSchema,
  assetPatchSchema,
} from '@cartera/shared';
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
  cx,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';
import { ASSET_TYPE_LABELS, COUNTRY_LABELS, price } from '../lib/format';

interface AssetFormState {
  symbol: string;
  name: string;
  assetType: AssetType;
  sector: string;
  country: string;
  currency: Currency;
  exchange: string;
  isin: string;
  priceMode: 'AUTO' | 'MANUAL';
  manualPrice: string;
  manualPriceCurrency: Currency;
  notes: string;
}

const emptyAsset = (currency: Currency = 'EUR'): AssetFormState => ({
  symbol: '',
  name: '',
  assetType: 'STOCK',
  sector: '',
  country: '',
  currency,
  exchange: '',
  isin: '',
  priceMode: 'AUTO',
  manualPrice: '',
  manualPriceCurrency: currency,
  notes: '',
});

const fromAsset = (asset: AssetRow): AssetFormState => ({
  symbol: asset.symbol,
  name: asset.name,
  assetType: asset.asset_type,
  sector: asset.sector ?? '',
  country: asset.country ?? '',
  currency: asset.currency,
  exchange: asset.exchange ?? '',
  isin: asset.isin ?? '',
  priceMode: asset.price_mode,
  manualPrice: asset.manual_price ?? '',
  manualPriceCurrency: asset.manual_price_currency ?? asset.currency,
  notes: asset.notes ?? '',
});

export const AssetsPage = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('edit');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<AssetFormState>(emptyAsset());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ data: AssetRow[] }>('/assets'),
  });

  const assets = assetsQuery.data?.data ?? [];

  const visibleAssets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(term) ||
        asset.name.toLowerCase().includes(term) ||
        (asset.sector ?? '').toLowerCase().includes(term) ||
        (asset.country ?? '').toLowerCase().includes(term),
    );
  }, [assets, search]);

  const patchForm = (patch: Partial<AssetFormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['assets'] });
    await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    await queryClient.invalidateQueries({ queryKey: ['history'] });
    await queryClient.invalidateQueries({ queryKey: ['allocation'] });
    await queryClient.invalidateQueries({ queryKey: ['performance'] });
  };

  const openCreate = () => {
    setForm(emptyAsset());
    setErrors({});
    setMessage(null);
    setCreateOpen(true);
  };

  const openEdit = (asset: AssetRow) => {
    setForm(fromAsset(asset));
    setErrors({});
    setMessage(null);
    setEditing(asset);
  };

  const createPayload = () => ({
    symbol: form.symbol,
    name: form.name,
    asset_type: form.assetType,
    sector: form.sector.trim() === '' ? null : form.sector.trim(),
    country: form.country.trim() === '' ? null : form.country.trim(),
    currency: form.currency,
    exchange: form.exchange.trim() === '' ? null : form.exchange.trim(),
    isin: form.isin.trim() === '' ? null : form.isin.trim(),
    price_mode: form.priceMode,
    manual_price: form.priceMode === 'MANUAL' ? form.manualPrice : null,
    manual_price_currency: form.priceMode === 'MANUAL' ? form.manualPriceCurrency : null,
    notes: form.notes.trim() === '' ? null : form.notes.trim(),
  });

  const patchPayload = () => ({
    name: form.name,
    asset_type: form.assetType,
    sector: form.sector.trim() === '' ? null : form.sector.trim(),
    country: form.country.trim() === '' ? null : form.country.trim(),
    exchange: form.exchange.trim() === '' ? null : form.exchange.trim(),
    isin: form.isin.trim() === '' ? null : form.isin.trim(),
    price_mode: form.priceMode,
    manual_price: form.priceMode === 'MANUAL' ? form.manualPrice : null,
    manual_price_currency: form.priceMode === 'MANUAL' ? form.manualPriceCurrency : null,
    notes: form.notes.trim() === '' ? null : form.notes.trim(),
  });

  const submitCreate = async () => {
    setMessage(null);
    const parsed = assetCreateSchema.safeParse(createPayload());
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/assets', parsed.data);
      await invalidate();
      setCreateOpen(false);
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

  const submitEdit = async () => {
    if (!editing) return;
    setMessage(null);
    const parsed = assetPatchSchema.safeParse(patchPayload());
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.patch(`/assets/${editing.id}`, parsed.data);
      await invalidate();
      setEditing(null);
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

  const remove = async (asset: AssetRow) => {
    if (
      !window.confirm(
        `¿Eliminar ${asset.symbol} del catálogo? Solo es posible si no tiene operaciones ni dividendos.`,
      )
    ) {
      return;
    }
    setDeletingId(asset.id);
    setMessage(null);
    try {
      await api.delete(`/assets/${asset.id}`);
      await invalidate();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!editId) return;
    const asset = assets.find((a) => a.id === editId);
    if (asset) {
      openEdit(asset);
      navigate('?', { replace: true });
    }
  }, [editId, assets, navigate]);

  const open = createOpen || editing !== null;
  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
  };

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        title="Activos"
        description="Tu catálogo de acciones, ETF, fondos y criptomonedas. Sector, país y tipo alimentan los gráficos de distribución."
        actions={
          <Button variant="primary" onClick={openCreate}>
            Nuevo activo
          </Button>
        }
      />

      {message && !open ? <ErrorNote>{message}</ErrorNote> : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Buscar" className="w-full sm:w-80">
            <Input
              placeholder="Símbolo, nombre, sector o país…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <p className="ml-auto text-xs text-muted">
            {visibleAssets.length} de {assets.length} activos
          </p>
        </div>
      </Card>

      {assetsQuery.isPending ? (
        <LoadingBlock label="Cargando activos…" />
      ) : assetsQuery.isError ? (
        <ErrorNote>No se pudo cargar el catálogo de activos.</ErrorNote>
      ) : assets.length === 0 ? (
        <Card>
          <EmptyState
            title="Todavía no tienes activos"
            description="Da de alta una acción, ETF o criptomoneda. Después podrás registrar compras y ventas sobre ella."
            action={
              <Button variant="primary" onClick={openCreate}>
                Crear el primero
              </Button>
            }
          />
        </Card>
      ) : visibleAssets.length === 0 ? (
        <Card>
          <EmptyState title="Sin resultados" description="Prueba con otro símbolo, sector o país." />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-medium">Activo</th>
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 font-medium">Sector</th>
                  <th className="px-3 py-3 font-medium">País</th>
                  <th className="px-3 py-3 font-medium">Divisa</th>
                  <th className="px-3 py-3 font-medium">Precio</th>
                  <th className="px-5 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssets.map((asset) => (
                  <tr
                    key={asset.id}
                    className="border-b border-line/60 transition last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="px-5 py-3">
                      <div>
                        <Link to={`/activos/${asset.id}`}>
                          <p className="font-medium text-ink">{asset.symbol}</p>
                        </Link>
                        <p className="max-w-[220px] truncate text-[11px] text-muted">
                          {asset.name}
                        </p>
                        {asset.exchange ? (
                          <p className="text-[10px] text-muted/70">{asset.exchange}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge>{ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type}</Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">{asset.sector ?? 'Sin clasificar'}</td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {asset.country ? COUNTRY_LABELS[asset.country] ?? asset.country : 'Sin país'}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">{asset.currency}</td>
                    <td className="px-3 py-3 text-xs">
                      {asset.price_mode === 'MANUAL' ? (
                        <span className="text-ink">
                          {price(asset.manual_price)}{' '}
                          <span className="text-muted">
                            {asset.manual_price_currency ?? asset.currency}
                          </span>
                          <Badge tone="warn">Manual</Badge>
                        </span>
                      ) : (
                        <span className="text-muted">Mercado</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="subtle" size="sm" onClick={() => openEdit(asset)}>
                          Editar
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={deletingId === asset.id}
                          onClick={() => void remove(asset)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title={editing ? `Editar ${editing.symbol}` : 'Nuevo activo'}
        subtitle={
          editing
            ? 'Clasificación y precio de respaldo. El símbolo no se modifica.'
            : 'El símbolo debe ser el de Yahoo Finance para que los precios se actualicen solos.'
        }
        wide
        footer={
          <>
            <Button variant="ghost" onClick={closeModal}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              onClick={() => void (editing ? submitEdit() : submitCreate())}
            >
              {editing ? 'Guardar cambios' : 'Crear activo'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {message ? <ErrorNote>{message}</ErrorNote> : null}

          {!editing ? <InstrumentSearch onPick={(instrument) => {
            patchForm({
              symbol: instrument.symbol,
              name: instrument.name,
              assetType: instrument.asset_type,
              currency: instrument.currency,
              exchange: instrument.exchange ?? '',
              sector: instrument.sector ?? '',
            });
          }} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Símbolo" error={errors.symbol} hint="Ej.: AAPL, SAN.MC, BTC-USD.">
              <Input
                value={form.symbol}
                disabled={Boolean(editing)}
                onChange={(event) => patchForm({ symbol: event.target.value.toUpperCase() })}
                placeholder="AAPL"
              />
            </Field>

            <Field label="Nombre" error={errors.name}>
              <Input
                value={form.name}
                onChange={(event) => patchForm({ name: event.target.value })}
                placeholder="Apple Inc."
              />
            </Field>

            <Field label="Tipo" error={errors.asset_type}>
              <Select
                value={form.assetType}
                onChange={(event) => patchForm({ assetType: event.target.value as AssetType })}
              >
                {ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ASSET_TYPE_LABELS[type] ?? type}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Divisa de cotización" error={errors.currency}>
              <Select
                value={form.currency}
                disabled={Boolean(editing)}
                onChange={(event) => {
                  const currency = event.target.value as Currency;
                  patchForm({ currency, manualPriceCurrency: currency });
                }}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Sector" error={errors.sector} hint="Ej.: Tecnología, Salud, Energía.">
              <Input
                value={form.sector}
                onChange={(event) => patchForm({ sector: event.target.value })}
                placeholder="Tecnología"
              />
            </Field>

            <Field label="País" error={errors.country} hint="Código ISO de dos letras: ES, US, IE…">
              <Input
                value={form.country}
                maxLength={2}
                onChange={(event) =>
                  patchForm({ country: event.target.value.toUpperCase() })
                }
                placeholder="US"
              />
            </Field>

            <Field label="Mercado" error={errors.exchange} hint="Opcional: NASDAQ, BME, XETRA…">
              <Input
                value={form.exchange}
                onChange={(event) => patchForm({ exchange: event.target.value })}
                placeholder="NASDAQ"
              />
            </Field>

            <Field label="ISIN" error={errors.isin} hint="Opcional.">
              <Input
                value={form.isin}
                onChange={(event) => patchForm({ isin: event.target.value.toUpperCase() })}
                placeholder="US0378331005"
              />
            </Field>
          </div>

          <Field label="Precio">
            <Segmented<'AUTO' | 'MANUAL'>
              options={[
                { value: 'AUTO', label: 'Automático (mercado)' },
                { value: 'MANUAL', label: 'Manual' },
              ]}
              value={form.priceMode}
              onChange={(priceMode) => patchForm({ priceMode })}
            />
          </Field>

          {form.priceMode === 'MANUAL' ? (
            <div className="grid gap-4 rounded-xl border border-line bg-surface-2 p-3 sm:grid-cols-2">
              <Field
                label="Precio manual"
                error={errors.manual_price}
                hint="Se usa si el proveedor de mercado no tiene el valor."
              >
                <Input
                  inputMode="decimal"
                  value={form.manualPrice}
                  onChange={(event) => patchForm({ manualPrice: event.target.value })}
                  placeholder="50,00"
                />
              </Field>
              <Field label="Divisa del precio manual" error={errors.manual_price_currency}>
                <Select
                  value={form.manualPriceCurrency}
                  onChange={(event) =>
                    patchForm({ manualPriceCurrency: event.target.value as Currency })
                  }
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          <Field label="Notas" error={errors.notes}>
            <Textarea
              value={form.notes}
              onChange={(event) => patchForm({ notes: event.target.value })}
              placeholder="Opcional: tesis de inversión, broker…"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
};

/** Buscador de instrumentos de Yahoo Finance para rellenar el alta. */
const InstrumentSearch = ({ onPick }: { onPick: (instrument: Instrument) => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) {
      setError('Escribe al menos dos caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ data: Instrument[] }>(
        `/market/instruments?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(response.data.slice(0, 8));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'El buscador de Yahoo no está disponible. Introduce los datos a mano.'
          : errorMessage(err),
      );
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="mb-2 text-xs font-semibold text-ink">Buscar en Yahoo Finance (opcional)</p>
      <div className="flex gap-2">
        <Input
          placeholder="Apple, Bitcoin, Santander…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
        />
        <Button type="button" variant="subtle" loading={loading} onClick={() => void search()}>
          Buscar
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-down">{error}</p> : null}
      {results && results.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Sin resultados. Prueba con el símbolo exacto.</p>
      ) : null}
      {results && results.length > 0 ? (
        <ul className="mt-2 divide-y divide-line/60">
          {results.map((instrument) => (
            <li key={`${instrument.symbol}-${instrument.exchange ?? ''}`}>
              <button
                type="button"
                onClick={() => onPick(instrument)}
                className={cx(
                  'flex w-full items-center justify-between gap-3 py-1.5 text-left text-xs transition hover:text-accent',
                )}
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">{instrument.symbol}</span>
                  <span className="ml-2 text-muted">{instrument.name}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {instrument.exchange ?? instrument.asset_type} · {instrument.currency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
