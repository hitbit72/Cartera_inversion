import { createHash, randomBytes } from 'node:crypto';
import type { InvitationRow } from '@cartera/shared';
import { config } from '../config.js';
import { dbFail } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { admin } from '../lib/supabase.js';

export interface CreatedInvitation {
  id: string;
  email: string;
  token: string;
  url: string;
  expires_at: string;
}

export interface InvitationSummary {
  id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const createInvitation = async (email: string): Promise<CreatedInvitation> => {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + config.INVITE_TTL_DAYS * 86_400_000).toISOString();

  const { data, error } = await admin()
    .from('invitations')
    .insert({ email: email.toLowerCase(), token_hash: tokenHash, expires_at: expiresAt })
    .select('id, email, expires_at')
    .single();

  if (error) dbFail(error, 'createInvitation');

  const row = data as Pick<InvitationRow, 'id' | 'email' | 'expires_at'>;

  return {
    id: row.id,
    email: row.email,
    token,
    url: `${config.inviteBaseUrl}/registro?token=${encodeURIComponent(token)}`,
    expires_at: row.expires_at,
  };
};

export const listInvitations = async (): Promise<InvitationSummary[]> => {
  const { data, error } = await admin()
    .from('invitations')
    .select('id, email, expires_at, accepted_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) dbFail(error, 'listInvitations');
  return (data ?? []) as InvitationSummary[];
};

export const revokeInvitation = async (id: string): Promise<boolean> => {
  const { data, error } = await admin()
    .from('invitations')
    .delete()
    .eq('id', id)
    .is('accepted_at', null)
    .select('id');

  if (error) dbFail(error, 'revokeInvitation');
  return (data ?? []).length > 0;
};

export type ClaimResult =
  | { status: 'ok'; invitation: InvitationRow }
  | { status: 'invalid' }
  | { status: 'used' }
  | { status: 'expired' };

/**
 * Consume la invitación de forma atómica. Solo una petición concurrente
 * puede pasar el filtro `accepted_at is null`.
 */
export const claimInvitation = async (token: string): Promise<ClaimResult> => {
  const tokenHash = hashInviteToken(token);
  const now = new Date().toISOString();

  const { data, error } = await admin()
    .from('invitations')
    .update({ accepted_at: now })
    .eq('token_hash', tokenHash)
    .is('accepted_at', null)
    .gt('expires_at', now)
    .select('*')
    .maybeSingle();

  if (error) dbFail(error, 'claimInvitation');
  if (data) return { status: 'ok', invitation: data as InvitationRow };

  const { data: existing, error: lookupError } = await admin()
    .from('invitations')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (lookupError) dbFail(lookupError, 'claimInvitation/lookup');
  if (!existing) return { status: 'invalid' };
  if ((existing as InvitationRow).accepted_at) return { status: 'used' };
  return { status: 'expired' };
};

export const releaseInvitation = async (id: string): Promise<void> => {
  const { error } = await admin().from('invitations').update({ accepted_at: null }).eq('id', id);
  if (error) dbFail(error, 'releaseInvitation');
};

export const invitationError = (result: Exclude<ClaimResult, { status: 'ok' }>): AppError => {
  switch (result.status) {
    case 'used':
      return new AppError(409, 'INVITATION_USED', 'Esta invitación ya se ha utilizado.');
    case 'expired':
      return new AppError(410, 'INVITATION_EXPIRED', 'Esta invitación ha caducado. Pide una nueva.');
    default:
      return new AppError(401, 'INVITATION_INVALID', 'La invitación no es válida.');
  }
};

export const invitationAcceptsEmail = (invitation: InvitationRow, email: string): boolean =>
  invitation.email.toLowerCase() === email.toLowerCase();
