const LOCALE = 'es-ES';

const moneyFormatters = new Map<string, Intl.NumberFormat>();

const moneyFormatter = (currency: string): Intl.NumberFormat => {
  const cached = moneyFormatters.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  moneyFormatters.set(currency, formatter);
  return formatter;
};

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Importe monetario con dos decimales. Acepta las cadenas decimales de la API. */
export const money = (value: string | number | null | undefined, currency: string): string => {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return moneyFormatter(currency).format(numeric);
};

/** Importe abreviado para ejes de gráficos: 12,4 mil · 1,2 M. */
export const compactMoney = (value: number, currency: string): string => {
  if (!Number.isFinite(value)) return '—';
  const prefix = currency === 'EUR' ? '' : `${currency} `;
  return `${prefix}${compactFormatter.format(value)}`;
};

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Porcentaje ya expresado en puntos (10.5 → «10,50 %»). */
export const percent = (value: string | number | null | undefined, withSign = false): string => {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const sign = withSign && numeric > 0 ? '+' : '';
  return `${sign}${percentFormatter.format(numeric)} %`;
};

/** Variación porcentual a partir de un índice base 100. */
export const indexChange = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric - 100 : null;
};

const quantityFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 8,
});

export const quantity = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return quantityFormatter.format(numeric);
};

const priceFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export const price = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return priceFormatter.format(numeric);
};

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
});

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
};

export const formatShortDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return shortDateFormatter.format(date);
};

/** «hace 3 min» para la marca de última actualización. */
export const timeAgo = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'ahora mismo';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  return formatDate(iso);
};

/** Color semántico según el signo. */
export const signClass = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return 'text-muted';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 'text-muted';
  return numeric > 0 ? 'text-up' : 'text-down';
};

export const today = (): string => new Date().toISOString().slice(0, 10);

export const shiftDays = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export const shiftYears = (years: number): string => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
};

/** Paleta de gráficos, estable entre renders. */
export const CHART_COLORS = [
  '#2dd4a7',
  '#60a5fa',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fb7185',
  '#38bdf8',
  '#facc15',
  '#c084fc',
  '#4ade80',
  '#f97316',
];

export const ASSET_TYPE_LABELS: Record<string, string> = {
  STOCK: 'Acción',
  ETF: 'ETF',
  CRYPTO: 'Cripto',
  FUND: 'Fondo',
  BOND: 'Bono',
};

export const DIMENSION_LABELS: Record<string, string> = {
  asset_type: 'Tipo',
  sector: 'Sector',
  country: 'País',
  currency: 'Divisa',
  asset: 'Activo',
};

export const COUNTRY_LABELS: Record<string, string> = {
  ES: 'España',
  US: 'Estados Unidos',
  GB: 'Reino Unido',
  DE: 'Alemania',
  FR: 'Francia',
  NL: 'Países Bajos',
  IE: 'Irlanda',
  LU: 'Luxemburgo',
  CH: 'Suiza',
  CA: 'Canadá',
  AU: 'Australia',
  JP: 'Japón',
  CN: 'China',
  HK: 'Hong Kong',
  SG: 'Singapur',
  SE: 'Suecia',
  NO: 'Noruega',
  DK: 'Dinamarca',
  FI: 'Finlandia',
  IT: 'Italia',
  PT: 'Portugal',
  BE: 'Bélgica',
  AT: 'Austria',
  PL: 'Polonia',
  CZ: 'República Checa',
  MX: 'México',
  BR: 'Brasil',
  IN: 'India',
  KR: 'Corea del Sur',
  TW: 'Taiwán',
  ZA: 'Sudáfrica',
};
