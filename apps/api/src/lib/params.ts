import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid() }).strict();

export const symbolParamSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9.^=-]+$/)),
  })
  .strict();
