import type { Request } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { unauthenticated } from './errors.js';

export interface AuthContext {
  userId: string;
  email: string | null;
  accessToken: string;
  client: SupabaseClient;
}

export const authContext = (req: Request): AuthContext => {
  if (!req.auth || !req.supabase) throw unauthenticated();
  return {
    userId: req.auth.userId,
    email: req.auth.email,
    accessToken: req.auth.accessToken,
    client: req.supabase,
  };
};
