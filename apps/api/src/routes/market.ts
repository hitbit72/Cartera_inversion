import { Router } from 'express';
import type {
  FxQuery,
  InstrumentsQuery,
  MarketHistoryQuery,
  QuotesQuery,
} from '@cartera/shared';
import {
  fxQuerySchema,
  instrumentsQuerySchema,
  marketHistoryQuerySchema,
  quotesQuerySchema,
} from '@cartera/shared';
import { authContext } from '../lib/context.js';
import { addDays, todayIso } from '../lib/dates.js';
import { rate as formatRate } from '../lib/decimal.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { symbolParamSchema } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import { marketRefreshLimiter } from '../middleware/rate-limit.js';
import { validateParams, validateQuery } from '../middleware/validate.js';
import { marketService } from '../services/market/service.js';
import { loadProfile } from '../services/profile.js';

export const marketRouter = Router();

marketRouter.use(requireAuth);

marketRouter.get('/quotes', validateQuery(quotesQuerySchema), async (req, res) => {
  const query = req.validatedQuery as QuotesQuery;
  const { quotes, warnings } = await marketService.getQuotes(query.symbols);

  if (quotes.size === 0) {
    throw new AppError(
      503,
      'MARKET_DATA_UNAVAILABLE',
      'No hay cotizaciones disponibles en este momento.',
    );
  }

  res.json({ data: Array.from(quotes.values()), warnings });
});

marketRouter.get(
  '/history/:symbol',
  validateParams(symbolParamSchema),
  validateQuery(marketHistoryQuerySchema),
  async (req, res) => {
    const { symbol } = req.validatedParams as { symbol: string };
    const query = req.validatedQuery as MarketHistoryQuery;

    const to = query.to && query.to < todayIso() ? query.to : todayIso();
    const from = query.from ?? addDays(to, -365);

    if (from > to) {
      throw new AppError(422, 'VALIDATION_ERROR', 'El rango de fechas no es válido.', {
        errors: [{ field: 'from', message: 'La fecha inicial no puede ser posterior a la final.' }],
      });
    }

    const history = await marketService.getHistory(symbol, from, to);

    if (history.candles.length === 0) {
      throw new AppError(
        503,
        'MARKET_DATA_UNAVAILABLE',
        'No hay datos históricos para ese símbolo.',
      );
    }

    res.json({
      symbol,
      currency: history.currency,
      candles: history.candles,
      stale: history.stale,
    });
  },
);

marketRouter.get('/fx', validateQuery(fxQuerySchema), async (req, res) => {
  const query = req.validatedQuery as FxQuery;
  const date = query.date ?? todayIso();

  if (query.from === query.to) {
    res.json({
      from: query.from,
      to: query.to,
      date,
      rate: formatRate(1),
      source: 'frankfurter',
      stale: false,
    });
    return;
  }

  const [fromRate, toRate] = await Promise.all([
    marketService.eurRate(query.from, date),
    marketService.eurRate(query.to, date),
  ]);

  // rate = unidades de `to` por 1 unidad de `from`.
  const cross = fromRate.rate.div(toRate.rate);

  res.json({
    from: query.from,
    to: query.to,
    date: fromRate.date,
    rate: formatRate(cross),
    source: fromRate.source,
    stale: fromRate.stale || toRate.stale,
  });
});

marketRouter.get('/instruments', validateQuery(instrumentsQuerySchema), async (req, res) => {
  const query = req.validatedQuery as InstrumentsQuery;
  const data = await marketService.searchInstruments(query.q);
  res.json({ data });
});

marketRouter.post('/refresh', marketRefreshLimiter, async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);

  const { data: assets } = await client
    .from('assets')
    .select('symbol, currency, price_mode')
    .eq('user_id', userId);

  const symbols = (assets ?? [])
    .filter((asset) => (asset as { price_mode?: string }).price_mode === 'AUTO')
    .map((asset) => (asset as { symbol: string }).symbol);

  const currencies = Array.from(
    new Set<string>([
      profile.base_currency,
      ...((assets ?? []) as Array<{ currency: string }>).map((asset) => asset.currency),
    ]),
  ) as never[];

  void (async () => {
    try {
      await Promise.all([
        symbols.length > 0 ? marketService.getQuotes(symbols) : Promise.resolve(),
        profile.benchmark_symbol
          ? marketService.getHistory(profile.benchmark_symbol, addDays(todayIso(), -365), todayIso())
          : Promise.resolve(),
        marketService.currentRates(currencies, todayIso()),
      ]);
    } catch (error) {
      logger.debug({ err: error }, 'Refresco de mercado en segundo plano falló parcialmente');
    }
  })();

  res.status(202).json({ queued: true });
});
