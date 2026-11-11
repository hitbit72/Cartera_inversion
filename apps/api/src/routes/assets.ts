import { Router } from 'express';
import type { AssetCreateInput, AssetPatchInput, AssetsQuery } from '@cartera/shared';
import { assetCreateSchema, assetPatchSchema, assetsQuerySchema } from '@cartera/shared';
import { authContext } from '../lib/context.js';
import { idParamSchema } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
  updateAsset,
} from '../services/assets.js';

export const assetsRouter = Router();

assetsRouter.use(requireAuth);

assetsRouter.get('/', validateQuery(assetsQuerySchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const data = await listAssets(client, userId, req.validatedQuery as AssetsQuery);
  res.json({ data });
});

assetsRouter.post('/', validateBody(assetCreateSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const asset = await createAsset(client, userId, req.validatedBody as AssetCreateInput);
  res.status(201).json(asset);
});

assetsRouter.get('/:id', validateParams(idParamSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const { id } = req.validatedParams as { id: string };
  const asset = await getAsset(client, userId, id);
  res.json(asset);
});

assetsRouter.patch(
  '/:id',
  validateParams(idParamSchema),
  validateBody(assetPatchSchema),
  async (req, res) => {
    const { userId, client } = authContext(req);
    const { id } = req.validatedParams as { id: string };
    const asset = await updateAsset(client, userId, id, req.validatedBody as AssetPatchInput);
    res.json(asset);
  },
);

assetsRouter.delete('/:id', validateParams(idParamSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const { id } = req.validatedParams as { id: string };
  await deleteAsset(client, userId, id);
  res.status(204).end();
});
