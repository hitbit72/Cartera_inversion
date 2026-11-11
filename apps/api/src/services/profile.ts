import type { ProfileRow, AccountRow, UserResponse } from '@cartera/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbFail } from '../lib/db.js';
import { notFound } from '../lib/errors.js';

export const loadProfile = async (
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRow> => {
  const { data, error } = await client.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) dbFail(error, 'loadProfile');
  if (!data) throw notFound('El perfil no existe.');
  return data as ProfileRow;
};

export const loadAccount = async (
  client: SupabaseClient,
  userId: string,
): Promise<AccountRow> => {
  const { data, error } = await client
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) dbFail(error, 'loadAccount');
  if (!data) throw notFound('La cuenta no existe.');
  return data as AccountRow;
};

export const buildUserResponse = async (
  client: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<UserResponse> => {
  const [profile, account] = await Promise.all([loadProfile(client, userId), loadAccount(client, userId)]);

  return {
    id: profile.id,
    email: email ?? '',
    display_name: profile.display_name,
    base_currency: profile.base_currency,
    cost_method: profile.cost_method,
    benchmark_symbol: profile.benchmark_symbol,
    theme: profile.theme,
    account: { id: account.id, name: account.name },
    created_at: profile.created_at,
  };
};

export const updateProfile = async (
  client: SupabaseClient,
  userId: string,
  email: string | null,
  patch: import('@cartera/shared').ProfilePatchInput,
): Promise<UserResponse> => {
  const { error } = await client.from('users').update(patch).eq('id', userId);
  if (error) dbFail(error, 'updateProfile');
  return buildUserResponse(client, userId, email);
};
