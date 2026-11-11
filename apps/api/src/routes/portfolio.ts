import { Router } from 'express';
import type {
  AllocationQuery,
  DividendsSummaryQuery,
  HistoryQuery,
  PerformanceQuery,
  PortfolioQuery,
} from '@cartera/shared';
import {
  allocationQuerySchema,
  dividendsSummaryQuerySchema,
  historyQuerySchema,
  performanceQuerySchema,
  portfolioQuerySchema,
} from '@cartera/shared';
import { authContext } from '../lib/context.js';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { loadProfile } from '../services/profile.js';
import { portfolioService } from '../services/portfolio.js';

export const portfolioRouter = Router();

portfolioRouter.use(requireAuth);

portfolioRouter.get('/', validateQuery(portfolioQuerySchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const query = req.validatedQuery as PortfolioQuery;
  const portfolio = await portfolioService.getPortfolio(client, profile, query.include_closed ?? false);
  res.json(portfolio);
});

portfolioRouter.get('/history', validateQuery(historyQuerySchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const history = await portfolioService.getHistory(
    client,
    profile,
    req.validatedQuery as HistoryQuery,
  );
  res.json(history);
});

portfolioRouter.get('/allocation', validateQuery(allocationQuerySchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const allocation = await portfolioService.getAllocation(
    client,
    profile,
    req.validatedQuery as AllocationQuery,
  );
  res.json(allocation);
});

portfolioRouter.get('/performance', validateQuery(performanceQuerySchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const performance = await portfolioService.getPerformance(
    client,
    profile,
    req.validatedQuery as PerformanceQuery,
  );
  res.json(performance);
});

portfolioRouter.get(
  '/dividends',
  validateQuery(dividendsSummaryQuerySchema),
  async (req, res) => {
    const { userId, client } = authContext(req);
    const profile = await loadProfile(client, userId);
    const summary = await portfolioService.getDividendsSummary(
      client,
      profile,
      req.validatedQuery as DividendsSummaryQuery,
    );
    res.json(summary);
  },
);
