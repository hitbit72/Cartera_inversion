import type { Currency, CostMethod, Theme } from './db.js';

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: ApiErrorCode;
  errors?: Array<{ field: string; message: string }>;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_INVALID'
  | 'INVITATION_INVALID'
  | 'INVITATION_USED'
  | 'INVITATION_EXPIRED'
  | 'RESET_TOKEN_INVALID'
  | 'EMAIL_NOT_VERIFIED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EMAIL_EXISTS'
  | 'DUPLICATE_ASSET'
  | 'ASSET_IN_USE'
  | 'INCONSISTENT_HISTORY'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_POSITION'
  | 'INVALID_WITHHOLDING'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'MARKET_DATA_UNAVAILABLE';

export interface Pagination {
  next_cursor: string | null;
  has_more: boolean;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface UserResponse {
  id: string;
  email: string;
  display_name: string;
  base_currency: Currency;
  cost_method: CostMethod;
  benchmark_symbol: string | null;
  theme: Theme;
  account: { id: string; name: string };
  created_at: string;
}
