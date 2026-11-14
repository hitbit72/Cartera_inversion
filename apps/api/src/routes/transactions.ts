import { Router } from 'express';
import type {
  TransactionCreateInput,
  TransactionPatchInput,
  TransactionsQuery,
} from '@cartera/shared';
import {
  csvTransactionImportSchema,
  transactionCreateSchema,
  transactionPatchSchema,
  transactionsQuerySchema,
} from '@cartera/shared';
import { authContext } from '../lib/context.js';
import { idParamSchema } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { loadProfile } from '../services/profile.js';
import {
  createTransaction,
  deleteTransaction,
  getTransactionView,
  importTransactions,
  listTransactions,
  updateTransaction,
} from '../services/transactions.js';

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);

transactionsRouter.get('/', validateQuery(transactionsQuerySchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const result = await listTransactions(client, profile, req.validatedQuery as TransactionsQuery);
  res.json(result);
});

transactionsRouter.post('/', validateBody(transactionCreateSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const transaction = await createTransaction(
    client,
    profile,
    req.validatedBody as TransactionCreateInput,
  );
  res.status(201).json(transaction);
});

/** Importa operaciones desde un array de filas CSV. Devuelve cuántas se
 *  importaron y los errores de las filas que fallaron. */
transactionsRouter.post(
  '/import',
  validateBody(csvTransactionImportSchema),
  async (req, res) => {
    const { userId, client } = authContext(req);
    const profile = await loadProfile(client, userId);
    const { rows } = req.validatedBody as import('@cartera/shared').CsvTransactionImport;
    const result = await importTransactions(client, profile, rows);
    res.json(result);
  },
);

transactionsRouter.get('/:id', validateParams(idParamSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const { id } = req.validatedParams as { id: string };
  const transaction = await getTransactionView(client, profile, id);
  res.json(transaction);
});

transactionsRouter.patch(
  '/:id',
  validateParams(idParamSchema),
  validateBody(transactionPatchSchema),
  async (req, res) => {
    const { userId, client } = authContext(req);
    const profile = await loadProfile(client, userId);
    const { id } = req.validatedParams as { id: string };
    const transaction = await updateTransaction(
      client,
      profile,
      id,
      req.validatedBody as TransactionPatchInput,
    );
    res.json(transaction);
  },
);

transactionsRouter.delete('/:id', validateParams(idParamSchema), async (req, res) => {
  const { userId, client } = authContext(req);
  const profile = await loadProfile(client, userId);
  const { id } = req.validatedParams as { id: string };
  await deleteTransaction(client, profile, id);
  res.status(204).end();
});
