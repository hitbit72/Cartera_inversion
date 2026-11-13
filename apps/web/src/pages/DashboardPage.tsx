import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  AllocationDimension,
  AllocationResponse,
  DividendSummaryResponse,
  MarketWarning,
  PerformanceResponse,
  PortfolioHistoryResponse,
  PortfolioResponse,
} from '@cartera/shared';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../app/providers';
import { PageHeader } from '../components/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  LoadingBlock,
  Segmented,
  Stat,
  cx,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import {
  ASSET_TYPE_LABELS,
  CHART_COLORS,
  DIMENSION_LABELS,
  compactMoney,
  formatDate,
  formatShortDate,
  money,
  percent,
  price,
  quantity,
  shiftYears,
  signClass,
} from '../lib/format';

type RangeKey = '1A' | '3A' | '5A' | 'MAX';

const RANGES: Array<{ value: RangeKey; label: string }> = [
  { value: '1A', label: '1A' },
  { value: '3A', label: '3A' },
  { value: '5A', label: '5A' },
  { value: 'MAX', label: 'Todo' },
];

const RANGE_YEARS: Record<Exclude<RangeKey, 'MAX'>, number> = { '1A': 1, '3A': 3, '5A': 5 };

const DIMENSIONS: Array<{ value: AllocationDimension; label: string }> = (
  ['asset_type', 'sector', 'country', 'currency', 'asset'] as AllocationDimension[]
).map((value) => ({ value, label: DIMENSION_LABELS[value] ?? value }));

const WARNING_TEXT: Record<MarketWarning['code'], (warning: MarketWarning) => string> = {
  PRICE_STALE: (warning) =>
    `El precio de ${warning.symbol ?? 'un activo'} está desactualizado${
      warning.as_of ? ` (${formatDate(warning.as_of)})` : ''
    }.`,
  FX_STALE: (warning) =>
    `El tipo de cambio está desactualizado${warning.as_of ? ` (${formatDate(warning.as_of)})` : ''}.`,
  PRICE_MISSING: (warning) =>
    `No hay precio para ${warning.symbol ?? 'un activo'}. Actualiza los precios o define uno manual en Activos.`,
};

const warningKey = (warning: MarketWarning) =>
  `${warning.code}:${warning.symbol ?? ''}:${warning.as_of ?? ''}`;

export const DashboardPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<RangeKey>('1A');
  const [dimension, setDimension] = useState<AllocationDimension>('asset_type');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api.get<PortfolioResponse>('/portfolio?include_closed=true'),
  });

  const portfolio = portfolioQuery.data;
  const hasPositions = (portfolio?.positions.length ?? 0) > 0;
  const base = portfolio?.base_currency ?? user?.base_currency ?? 'EUR';

  const historyQuery = useQuery({
    queryKey: ['history', range],
    enabled: hasPositions,
    queryFn: () => {
      const params = new URLSearchParams({
        interval: range === '1A' ? '1w' : '1m',
        benchmark: 'true',
      });
      if (range !== 'MAX') params.set('from', shiftYears(RANGE_YEARS[range]));
      return api.get<PortfolioHistoryResponse>(`/portfolio/history?${params.toString()}`);
    },
  });

  const allocationQuery = useQuery({
    queryKey: ['allocation', dimension],
    enabled: hasPositions,
    queryFn: () =>
      api.get<AllocationResponse>(
        `/portfolio/allocation?dimension=${dimension}&metric=market_value`,
      ),
  });

  // El KPI debe cubrir el mismo periodo que el gráfico: si no, un rango de
  // un año mostraría el TWR de un solo día (0 % en carteras recién creadas).
  const performanceQuery = useQuery({
    queryKey: ['performance', range],
    enabled: hasPositions,
    queryFn: () => {
      const params = new URLSearchParams();
      if (range !== 'MAX') params.set('from', shiftYears(RANGE_YEARS[range]));
      const queryString = params.toString();
      return api.get<PerformanceResponse>(
        `/portfolio/performance${queryString ? `?${queryString}` : ''}`,
      );
    },
  });

  const dividendsQuery = useQuery({
    queryKey: ['dividends-summary', 'year'],
    queryFn: () => api.get<DividendSummaryResponse>('/portfolio/dividends?group_by=year'),
  });

  const chartData = useMemo(
    () =>
      (historyQuery.data?.series ?? []).map((point) => ({
        date: point.date,
        cartera: Number(point.twr_index) - 100,
        benchmark: point.benchmark_index === null ? null : Number(point.benchmark_index) - 100,
      })),
    [historyQuery.data],
  );

  const dividendBars = useMemo(() => {
    const items = dividendsQuery.data?.items ?? [];
    return items.slice(-6).map((item) => ({ label: item.label, net: Number(item.net) }));
  }, [dividendsQuery.data]);

  const positions = useMemo(
    () =>
      (portfolio?.positions ?? [])
        .filter((position) => Number(position.quantity) > 0)
        .sort((a, b) => Number(b.market_value) - Number(a.market_value)),
    [portfolio],
  );

  const closedPositions = useMemo(
    () =>
      (portfolio?.positions ?? []).filter((position) => Number(position.quantity) === 0),
    [portfolio],
  );

  const closedRealized = useMemo(
    () =>
      closedPositions.reduce((total, p) => total + Number(p.realized_pnl), 0),
    [closedPositions],
  );

  const closedDividends = useMemo(
    () =>
      closedPositions.reduce((total, p) => total + Number(p.dividends_net), 0),
    [closedPositions],
  );

  const warnings = useMemo(() => {
    const all = [...(portfolio?.warnings ?? []), ...(historyQuery.data?.warnings ?? [])];
    const seen = new Set<string>();
    return all.filter((warning) => {
      const key = warningKey(warning);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [historyQuery.data?.warnings, portfolio?.warnings]);

  const refreshPrices = async () => {
    setRefreshError(null);
    setRefreshing(true);
    try {
      await api.post('/market/refresh');
      // El servidor responde 202 y actualiza en segundo plano.
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      await queryClient.invalidateQueries({ queryKey: ['history'] });
      await queryClient.invalidateQueries({ queryKey: ['allocation'] });
      await queryClient.invalidateQueries({ queryKey: ['performance'] });
    } catch (error) {
      setRefreshError(
        error instanceof ApiError ? error.message : 'No se pudieron actualizar los precios.',
      );
    } finally {
      setRefreshing(false);
    }
  };

  if (portfolioQuery.isPending) return <LoadingBlock label="Calculando tu cartera…" />;

  if (portfolioQuery.isError || !portfolio) {
    return (
      <div className="space-y-4">
        <PageHeader title="Resumen" />
        <ErrorNote>
          No se pudo cargar la cartera.{' '}
          {portfolioQuery.error instanceof ApiError ? portfolioQuery.error.message : ''}
        </ErrorNote>
        <Button onClick={() => void portfolioQuery.refetch()}>Reintentar</Button>
      </div>
    );
  }

  const totals = portfolio.totals;

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        title="Resumen"
        description={
          <>
            Valoración a {formatDate(portfolio.as_of)} · importes en{' '}
            <span className="font-medium text-ink">{base}</span>
          </>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void refreshPrices()} loading={refreshing}>
              Actualizar precios
            </Button>
            <Link
              to="/operaciones"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:brightness-110 dark:text-[#04120d]"
            >
              Nueva operación
            </Link>
          </>
        }
      />

      {refreshError ? <ErrorNote>{refreshError}</ErrorNote> : null}

      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-500">
          <p className="font-semibold">Avisos de datos de mercado</p>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((warning) => (
              <li key={warningKey(warning)}>· {WARNING_TEXT[warning.code](warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!hasPositions ? (
        <Card>
          <EmptyState
            title="Tu cartera está vacía"
            description="Registra tu primera compra de acciones, ETF o criptomonedas. Los cálculos de plusvalías, dividendos y rentabilidad se harán solos."
            action={
              <Link
                to="/operaciones"
                className="inline-flex items-center rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:brightness-110 dark:text-[#04120d]"
              >
                Registrar una compra
              </Link>
            }
          />
        </Card>
      ) : (
        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              label="Valor de mercado"
              value={money(totals.market_value, base)}
              hint={`Coste de lo que tienes: ${money(totals.cost_basis, base)}`}
            />
            <Stat
              label="Plusvalía no realizada"
              value={money(totals.unrealized_pnl, base)}
              tone={signClass(totals.unrealized_pnl)}
              hint={`${percent(totals.unrealized_pnl_pct, true)} sobre el coste`}
            />
            <Stat
              label="Rendimiento total"
              value={percent(totals.total_return_pct, true)}
              tone={signClass(totals.total_return_pct)}
              hint={`${money(totals.total_pnl, base)} entre plusvalías y dividendos`}
            />
            <Stat
              label="Dividendos netos"
              value={money(totals.dividends_net, base)}
              tone="text-up"
              hint="Cobrado después de retenciones"
            />
            <Stat
              label="Plusvalía realizada"
              value={money(totals.realized_pnl, base)}
              tone={signClass(totals.realized_pnl)}
              hint="Ventas ya cerradas"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Evolución de la rentabilidad"
                subtitle={
                  historyQuery.data?.benchmark
                    ? `Rentabilidad acumulada frente a ${historyQuery.data.benchmark.symbol}. Base 100 al inicio.`
                    : 'Rentabilidad acumulada de la cartera. Base 100 al inicio.'
                }
                actions={
                  <Segmented
                    options={RANGES}
                    value={range}
                    onChange={setRange}
                    size="sm"
                  />
                }
              />

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat
                  label="TWR del periodo"
                  value={
                    performanceQuery.data ? percent(performanceQuery.data.twr_pct, true) : '—'
                  }
                  tone={signClass(performanceQuery.data?.twr_pct)}
                />
                <MiniStat
                  label="Anualizada (XIRR)"
                  value={
                    performanceQuery.data?.xirr_pct
                      ? percent(performanceQuery.data.xirr_pct, true)
                      : '—'
                  }
                  tone={signClass(performanceQuery.data?.xirr_pct)}
                />
                <MiniStat
                  label="Benchmark"
                  value={
                    performanceQuery.data?.benchmark
                      ? percent(performanceQuery.data.benchmark.twr_pct, true)
                      : 'Sin comparación'
                  }
                  tone={signClass(performanceQuery.data?.benchmark?.twr_pct)}
                />
                <MiniStat
                  label="Aportado neto"
                  value={money(totals.net_invested, base)}
                />
              </div>

              {historyQuery.isPending ? (
                <LoadingBlock label="Cargando histórico…" />
              ) : historyQuery.isError ? (
                <ErrorNote>No se pudo cargar el histórico de la cartera.</ErrorNote>
              ) : chartData.length === 0 ? (
                <EmptyState title="Aún no hay histórico" />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2dd4a7" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#2dd4a7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatShortDate(String(value))}
                        tick={{ fill: 'var(--muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={32}
                      />
                      <YAxis
                        tickFormatter={(value) => `${Number(value).toFixed(0)} %`}
                        tick={{ fill: 'var(--muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <Tooltip
                        labelFormatter={(label) => formatDate(String(label))}
                        formatter={(value, name) => [
                          `${Number(value).toFixed(2)} %`,
                          name === 'cartera' ? 'Cartera' : 'Benchmark',
                        ]}
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--line)',
                          borderRadius: 10,
                          fontSize: 12,
                          color: 'var(--ink)',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="cartera"
                        name="cartera"
                        stroke="#2dd4a7"
                        strokeWidth={2}
                        fill="url(#portfolioFill)"
                        connectNulls
                      />
                      {historyQuery.data?.benchmark ? (
                        <Line
                          type="monotone"
                          dataKey="benchmark"
                          name="benchmark"
                          stroke="#60a5fa"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                          connectNulls
                        />
                      ) : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Distribución"
                subtitle={`Valor de mercado por ${(DIMENSION_LABELS[dimension] ?? dimension).toLowerCase()}.`}
              />
              <div className="mb-4 overflow-x-auto">
                <Segmented options={DIMENSIONS} value={dimension} onChange={setDimension} size="sm" />
              </div>

              {allocationQuery.isPending ? (
                <LoadingBlock label="Calculando…" />
              ) : allocationQuery.isError ? (
                <ErrorNote>No se pudo calcular la distribución.</ErrorNote>
              ) : (allocationQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyState title="Sin datos" />
              ) : (
                <>
                  <div className="relative h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={allocationQuery.data?.items ?? []}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={1.5}
                          stroke="var(--surface)"
                          strokeWidth={2}
                        >
                          {(allocationQuery.data?.items ?? []).map((item, index) => (
                            <Cell
                              key={item.key}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => money(String(value), base)}
                          contentStyle={{
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            borderRadius: 10,
                            fontSize: 12,
                            color: 'var(--ink)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase tracking-wider text-muted">Total</span>
                      <span className="tabular text-sm font-semibold">
                        {money(allocationQuery.data?.total, base)}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {(allocationQuery.data?.items ?? []).slice(0, 8).map((item, index) => (
                      <li key={item.key} className="flex items-center gap-2 text-xs">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate text-ink" title={item.label}>
                          {item.label}
                        </span>
                        <span className="tabular text-muted">{percent(item.weight_pct)}</span>
                        <span className="tabular w-24 text-right text-ink">
                          {money(item.value, base)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <Card padded={false}>
            <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">Posiciones abiertas</h2>
                <p className="mt-1 text-xs text-muted">
                  {positions.length} {positions.length === 1 ? 'activo' : 'activos'} · coste{' '}
                  {portfolio.cost_method === 'FIFO' ? 'FIFO' : 'medio'} · tipos de cambio del{' '}
                  {formatDate(portfolio.fx.date)}
                </p>
              </div>
              <Link
                to="/activos"
                className="text-xs font-medium text-accent hover:underline"
              >
                Gestionar activos
              </Link>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-5 py-2.5 font-medium">Activo</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-2.5 text-right font-medium">Coste medio</th>
                    <th className="px-3 py-2.5 text-right font-medium">Precio</th>
                    <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                    <th className="px-3 py-2.5 text-right font-medium">P&L no realizado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Dividendos</th>
                    <th className="px-5 py-2.5 text-right font-medium">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr
                      key={position.asset.id}
                      className="border-b border-line/60 transition last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <Link to={`/activos/${position.asset.id}`}>
                              <p className="font-medium text-ink">{position.asset.symbol}</p>
                            </Link>
                            <p className="max-w-[200px] truncate text-[11px] text-muted">
                              {position.asset.name}
                            </p>
                          </div>
                          {position.price_stale ? <Badge tone="warn">Desactualizado</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular">{quantity(position.quantity)}</td>
                      <td className="px-3 py-3 text-right tabular">
                        {price(position.avg_cost_native)}
                        <span className="block text-[11px] text-muted">{position.asset.currency}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {price(position.current_price_native)}
                        <span className="block text-[11px] text-muted">{position.asset.currency}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        {money(position.market_value, base)}
                      </td>
                      <td className="px-3 py-3 text-right tabular">
                        <span className={signClass(position.unrealized_pnl)}>
                          {money(position.unrealized_pnl, base)}
                        </span>
                        <span className={cx('block text-[11px]', signClass(position.unrealized_pnl_pct))}>
                          {percent(position.unrealized_pnl_pct, true)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular text-muted">
                        {money(position.dividends_net, base)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line sm:block">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{
                                width: `${Math.min(100, Math.max(0, Number(position.weight_pct)))}%`,
                              }}
                            />
                          </div>
                          <span className="tabular w-14 text-right text-xs">
                            {percent(position.weight_pct)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-5">
              <div>
                <h2 className="text-sm font-semibold text-ink">Posiciones cerradas</h2>
                <p className="mt-1 text-xs text-muted">
                  {closedPositions.length} {closedPositions.length === 1 ? 'activo' : 'activos'} ·{' '}
                  {money(closedRealized, base)} P&L realizado · {money(closedDividends, base)} dividendos netos
                </p>
              </div>
            </div>

            {closedPositions.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <EmptyState
                  title="Sin posiciones cerradas"
                  description="Cuando vendas una posición por completo, aparecerá aquí con su P&L realizado y sus dividendos acumulados."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="px-5 py-3 font-medium">Activo</th>
                      <th className="px-3 py-3 text-right font-medium">Coste</th>
                      <th className="px-3 py-3 text-right font-medium">P&L realizado</th>
                      <th className="px-3 py-3 text-right font-medium">Dividendos netos</th>
                      <th className="px-3 py-3 text-right font-medium">Total P&L</th>
                      <th className="px-5 py-3 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((position) => (
                      <tr
                        key={position.asset.id}
                        className="border-b border-line/60 transition last:border-0 hover:bg-surface-2/60"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div>
                              <Link to={`/activos/${position.asset.id}`}>
                                <p className="font-medium text-ink">{position.asset.symbol}</p>
                              </Link>
                              <p className="max-w-[200px] truncate text-[11px] text-muted">
                                {position.asset.name}
                              </p>
                              <span className="text-[10px] text-muted/70">{position.asset.asset_type}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular text-muted">
                          {money(position.cost_basis, base)}
                        </td>
                        <td className="px-3 py-3 text-right tabular">
                          <span className={signClass(position.realized_pnl)}>
                            {money(position.realized_pnl, base)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular text-muted">
                          {money(position.dividends_net, base)}
                        </td>
                        <td className="px-3 py-3 text-right tabular">
                          <span className={signClass(position.total_pnl)}>
                            {money(position.total_pnl, base)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            to={`/activos/${position.asset.id}`}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Dividendos por año"
                subtitle={`Total cobrado: ${money(dividendsQuery.data?.total.net, base)} neto`}
                actions={
                  <Link to="/dividendos" className="text-xs font-medium text-accent hover:underline">
                    Ver detalle
                  </Link>
                }
              />
              {dividendsQuery.isPending ? (
                <LoadingBlock label="Cargando dividendos…" />
              ) : dividendBars.length === 0 ? (
                <EmptyState
                  title="Sin dividendos registrados"
                  description="Cuando cobres un dividendo, anótalo para que cuente en tu rentabilidad total."
                />
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dividendBars} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => compactMoney(Number(value), base)}
                        tick={{ fill: 'var(--muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                      />
                      <Tooltip
                        formatter={(value) => money(Number(value), base)}
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--line)',
                          borderRadius: 10,
                          fontSize: 12,
                          color: 'var(--ink)',
                        }}
                      />
                      <Bar dataKey="net" name="Neto" fill="#2dd4a7" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Cómo se calculan tus números" />
              <ul className="space-y-3 text-xs leading-relaxed text-muted">
                <li>
                  <span className="font-medium text-ink">Plusvalías:</span> método{' '}
                  {portfolio.cost_method === 'FIFO' ? 'FIFO (primeras compras primero)' : 'de coste medio'}.
                  Puedes cambiarlo en Ajustes.
                </li>
                <li>
                  <span className="font-medium text-ink">Cambio de divisa:</span> cada operación se
                  convierte a {base} con el tipo del día de la operación; la cartera actual usa el
                  tipo del {formatDate(portfolio.fx.date)}.
                </li>
                <li>
                  <span className="font-medium text-ink">Rentabilidad total:</span> plusvalías
                  realizadas y no realizadas más dividendos netos, dividido entre el dinero aportado.
                </li>
                <li>
                  <span className="font-medium text-ink">TWR:</span> mide cómo se comporta tu
                  cartera sin que las aportaciones o retiradas inflen el resultado.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

const MiniStat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) => (
  <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
    <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
    <p className={cx('tabular mt-0.5 text-sm font-semibold', tone ?? 'text-ink')}>{value}</p>
  </div>
);
