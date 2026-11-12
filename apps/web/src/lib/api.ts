import type { ApiProblem } from '@cartera/shared';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, problem: Partial<ApiProblem> | null) {
    super(problem?.detail ?? 'No se pudo completar la operación.');
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? 'INTERNAL_ERROR';
    this.fields = {};
    for (const issue of problem?.errors ?? []) {
      // El primero gana: es el más específico.
      if (!(issue.field in this.fields)) this.fields[issue.field] = issue.message;
    }
  }

  field(name: string): string | undefined {
    return this.fields[name];
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  body?: unknown;
  /** Reintento tras renovar la sesión. Uso interno. */
  retry?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Renueva el access token con la cookie de refresco. Se comparte la misma
 * promesa entre peticiones simultáneas para no rotar el refresh token dos veces.
 */
export const refreshSession = async (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        // Se libera en el siguiente microtask para que las peticiones que ya
        // estaban esperando compartan el resultado.
        queueMicrotask(() => {
          refreshInFlight = null;
        });
      });
  }
  return refreshInFlight;
};

const request = async <T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> => {
  const { body, retry = true } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(BASE + path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      return request<T>(method, path, { body, retry: false });
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload as Partial<ApiProblem> | null);
  }

  return payload as T;
};

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
