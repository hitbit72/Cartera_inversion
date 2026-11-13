import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AssetRow, DividendView, PortfolioResponse, TransactionView } from '@cartera/shared';
import { PageHeader } from '../components/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  Stat,
} from '../components/ui';
import { api } from '../lib/api';
import {
  ASSET_TYPE_LABELS,
  COUNTRY_LABELS,
  compactMoney,
  formatDate,
  money,
  percent,
  price,
  quantity,
  signClass,
} from '../lib/format';

export const AssetDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const assetQuery = useQuery({
    queryKey: ['asset', id],
    enabled: Boolean(id),
    queryFn: () => api.get<AssetRow>(`/assets/${id}`),
  });

  const portfolioQuery = useQuery({
    queryKey: ['portfolio', { include_closed: true }],
    queryFn: () => api.get<PortfolioResponse>('/portfolio?include_closed=true'),
  });

  const transactionsQuery = useQuery({
    queryKey: ['transactions', 'asset', id],
    enabled: Boolean(id),
    queryFn: () =>
      api.get<{ data: TransactionView[] }>(`/transactions?asset_id=${encodeURIComponent(id!)}&limit=200`),
  });

  const dividendsQuery = useQuery({
    queryKey: ['dividends', 'asset', id],
    enabled: Boolean(id),
    queryFn: () =>
      api.get<{ data: DividendView[] }>(`/dividends?asset_id=${encodeURIComponent(id!)}&limit=200`),
  });

  const asset = assetQuery.data;
  const portfolio = portfolioQuery.data;
  const position = portfolio?.positions.find((p) => p.asset.id === id);
  const isOpen = position ? Number(position.quantity) > 0 : false;
  const isClosed = asset && position ? Number(position.quantity) === 0 : false;
  const hasData = Boolean(position || transactionsQuery.data?.data.length || dividendsQuery.data?.data.length);

  const transactions = transactionsQuery.data?.data ?? [];
  const dividends = dividendsQuery.data?.data ?? [];

  if (assetQuery.isPending || portfolioQuery.isPending || transactionsQuery.isPending || dividendsQuery.isPending) {
    return <LoadingBlock label="Cargando ficha del activo…" />;
  }

  if (assetQuery.isError || portfolioQuery.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Activo" description="Ficha de detalle del activo." />
        <ErrorNote>
          No se pudo cargar la ficha del activo.{' '}
          {(assetQuery.error?.message ?? portfolioQuery.error?.message) ?? ''}
        </ErrorNote>
        <Button onClick={() => navigate(-1)}>Volver</Button>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="space-y-4">
        <PageHeader title="Activo" description="Ficha de detalle del activo." />
        <EmptyState title="Activo no encontrado" description="El activo ya no existe o fue eliminado." />
        <Button onClick={() => navigate('/activos')}>Volver a activos</Button>
      </div>
    );
  }

  const base = portfolio?.base_currency ?? 'EUR';
  const marketValue = Number(position?.market_value ?? 0);
  const costBasis = Number(position?.cost_basis ?? 0);
  const totalPnl = Number(position?.total_pnl ?? 0);
  const realizedPnl = Number(position?.realized_pnl ?? 0);
  const dividendsNet = Number(position?.dividends_net ?? 0);
  const weight = Number(position?.weight_pct ?? 0);

  const assetUrl = `/activos/${asset.id}`;

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        title={asset.name}
        description={`Símbolo ${asset.symbol} · ${asset.currency}`}
        actions={
          <>
            <Button variant="subtle" size="sm" onClick={() => navigate(`/activos?edit=${asset.id}`)}>
              Editar activo
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate(`/operaciones?asset=${asset.id}`)}>
              Nueva operación
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/activos')}>
              Volver a activos
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader
          title={asset.symbol}
          subtitle={
            <>
              {asset.name} · {ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type}{' · '}
              {asset.exchange}
            </>
          }
          actions={
            <Badge tone={asset.price_mode === 'MANUAL' ? 'warn' : 'neutral'}>
              {asset.price_mode === 'MANUAL' ? 'Precio manual' : 'Mercado'}
            </Badge>
          }
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-wider text-muted">Sector</p>
            <p className="text-xs text-ink">{asset.sector ?? 'Sin clasificar'}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-wider text-muted">País</p>
            <p className="text-xs text-ink">
              {asset.country ? COUNTRY_LABELS[asset.country] ?? asset.country : 'Sin país'}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-wider text-muted">Divisa</p>
            <p className="text-xs text-ink tabular">{asset.currency}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-wider text-muted">ISIN</p>
            <p className="text-xs text-muted">{asset.isin ?? '—'}</p>
          </div>
        </div>
        {asset.notes ? (
          <div className="mt-4 p-3 rounded-lg border border-line bg-surface-2 text-xs text-muted">
            {asset.notes}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Posición"
          subtitle={
            <>
              {isClosed ? 'Posición cerrada (cantidad cero)' : 'Posición abierta'} · tipos de cambio del{' '}
              {formatDate(portfolio?.fx.date)}
            </>
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Cantidad" value={quantity(position?.quantity)} hint={isClosed ? 'Cerrada' : 'Abierta'} />
          <Stat
            label="Coste medio"
            value={price(position?.avg_cost_native)}
            hint={`${position?.asset.currency} · ${money(position?.avg_cost, base)} en ${base}`}
          />
          <Stat
            label="Precio actual"
            value={price(position?.current_price_native)}
            hint={
              position?.current_price === null
                ? 'Sin precio de mercado'
                : `${position?.asset.currency} · ${money(position?.current_price, base)} en ${base}`
            }
          />
          <Stat label="Valor de mercado" value={money(position?.market_value, base)} />
          <Stat
            label="P&L no realizado"
            value={money(position?.unrealized_pnl, base)}
            tone={signClass(position?.unrealized_pnl)}
            hint={percent(position?.unrealized_pnl_pct, true)}
          />
          <Stat
            label="P&L realizado"
            value={money(position?.realized_pnl, base)}
            tone={signClass(position?.realized_pnl)}
            hint="Ventas cerradas de este activo"
          />
          <Stat
            label="Dividendos netos"
            value={money(position?.dividends_net, base)}
            tone="text-up"
            hint="Cobrado después de retenciones"
          />
          <Stat
            label="Rendimiento total"
            value={percent(position?.total_pnl && costBasis ? (totalPnl / costBasis) * 100 : 0, true)}
            tone={signClass(totalPnl)}
            hint={`${money(position?.total_pnl, base)} sobre el coste de ${money(position?.cost_basis, base)}`}
          />
          <Stat
            label="Peso en cartera"
            value={percent(weight)}
            hint={money(position?.market_value, base)}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-5">
            <div>
              <h2 className="text-sm font-semibold text-ink">Operaciones</h2>
              <p className="mt-1 text-xs text-muted">
                {transactions.length} {transactions.length === 1 ? 'movimiento' : 'movimientos'}
              </p>
            </div>
          </div>
          {transactions.length === 0 ? (
            <EmptyState title="Sin operaciones" description="No hay compras ni ventas registradas para este activo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-5 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 text-right font-medium">Tipo</th>
                    <th className="px-3 py-3 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-3 text-right font-medium">Precio</th>
                    <th className="px-3 py-3 text-right font-medium">Importe neto</th>
                    <th className="px-3 py-3 text-right font-medium">P&L realizado</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isBuy = tx.type === 'BUY';
                    return (
                      <tr
                        key={tx.id}
                        className="border-b border-line/60 transition last:border-0 hover:bg-surface-2/60"
                      >
                        <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                          {formatDate(tx.trade_date)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Badge tone={isBuy ? 'accent' : 'down'}>
                            {isBuy ? 'Compra' : 'Venta'}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right tabular">{quantity(tx.quantity)}</td>
                        <td className="px-3 py-3 text-right tabular">
                          {price(tx.unit_price)}
                          <span className="block text-[11px] text-muted">{tx.currency}</span>
                        </td>
                        <td className="px-3 py-3 text-right tabular">
                          {money(tx.net_amount_base, base)}
                        </td>
                        <td className="px-3 py-3 text-right tabular">
                          {tx.realized_pnl_base === null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className={signClass(tx.realized_pnl_base)}>
                              {money(tx.realized_pnl_base, base)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padded={false}>
          <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-5">
            <div>
              <h2 className="text-sm font-semibold text-ink">Dividendos</h2>
              <p className="mt-1 text-xs text-muted">
                {dividends.length} {dividends.length === 1 ? 'cobro' : 'cobros'}
              </p>
            </div>
          </div>
          {dividends.length === 0 ? (
            <EmptyState title="Sin dividendos" description="No hay dividendos registrados para este activo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-5 py-3 font-medium">Fecha de cobro</th>
                    <th className="px-3 py-3 text-right font-medium">Bruto</th>
                    <th className="px-3 py-3 text-right font-medium">Retención</th>
                    <th className="px-3 py-3 text-right font-medium">Neto</th>
                    <th className="px-3 py-3 text-right font-medium">Neto en {base}</th>
                  </tr>
                </thead>
                <tbody>
                  {dividends.map((div) => (
                    <tr
                      key={div.id}
                      className="border-b border-line/60 transition last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                        {formatDate(div.payment_date)}
                      </td>
                      <td className="px-3 py-3 text-right tabular text-muted">
                        {money(div.gross_amount, div.currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular text-muted">
                        {money(div.withholding_tax, div.currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular text-muted">
                        {money(div.net_amount, div.currency)}
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {money(div.net_amount_base, base)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {!hasData && !isOpen ? (
        <Card>
          <EmptyState
            title="Sin datos de este activo"
            description="Registra una compra o un dividendo para empezar a ver la posición y el rendimiento de este activo."
            action={
              <Button variant="primary" onClick={() => navigate(`/operaciones?asset=${asset.id}`)}>
                Nueva operación
              </Button>
            }
          />
        </Card>
      ) : null}
    </div>
  );
};
