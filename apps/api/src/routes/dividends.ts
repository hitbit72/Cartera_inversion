import { Router } from 'express';
import type { DividendCreateInput, DividendPatchInput, DividendsQuery } from '@cartera/shared';
import {
  dividendCreateSchema,
  dividendPatchSchema,
  dividendsQuerySchema,
} from '@cartera/shared';
import { authContext } from '../lib/context.js';
import { idParamSchema } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { loadProfile } from '../services/profile.js';
import {
  createDividend,
  deleteDividend,
  getDividendView,
  listDividends,
  updateDividend,
} from '../services/dividends.js';

export const dividendsRouter = Router();

dividendsRouter.use(requireAuth);

dividendsRouter.get('/', validateQuery(dividendsQuerySchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const result = await listDividends(client, profile, req.validatedQuery as DividendsQuery);
  res.json(result);
});

dividendsRouter.post('/', validateBody(dividendCreateSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const dividend = await createDividend(
    client,
    profile,
    req.validatedBody as DividendCreateInput,
  );
  res.status(201).json(dividend);
});

dividendsRouter.get('/:id', validateParams(idParamSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const { id } = req.validatedParams as { id: string };
  const dividend = await getDividendView(client, profile, id);
  res.json(dividend);
});

dividendsRouter.patch(
  '/:id',
  validateParams(idParamSchema),
  validateBody(dividendPatchSchema),
  async (req, res) => {
    const { userId, client } = authContext(req);
    const profile = await loadProfile(client, userId);
    const { id } = req.validatedParams as { id: string };
    const dividend = await updateDividend(
      client,
      profile,
      id,
      req.validatedBody as DividendPatchInput,
    );
    res.json(dividend);
  },
);

dividendsRouter.delete('/:id', validateParams(idParamSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const { id } = req.validatedParams as { id: string };
  await deleteDividend(client, profile, id);
  res.status(204).end();
});
