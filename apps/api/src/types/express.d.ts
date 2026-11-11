import type { SupabaseClient } from '@supabase/supabase-js';
import type { VerifiedToken } from '../lib/jwt.js';

declare global {
  namespace Express {
    interface Request {
      auth?: VerifiedToken;
      supabase?: SupabaseClient;
      requestId?: string;
      validatedQuery?: unknown;
      validatedBody?: unknown;
      validatedParams?: unknown;
    }
  }
}

export {};
