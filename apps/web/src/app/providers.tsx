import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Theme, UserResponse } from '@cartera/shared';
import { ApiError, api } from '../lib/api';

/* ------------------------------------------------------------------ */
/* Tema                                                                */
/* ------------------------------------------------------------------ */

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: 'light' | 'dark';
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = 'cartera.theme';

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const applyTheme = (theme: Theme): 'light' | 'dark' => {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#070c16' : '#f3f5fa');
  return dark ? 'dark' : 'light';
};

const readStoredTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
};

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

type AuthContextValue = {
  user: UserResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { token: string; display_name: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  patchProfile: (patch: Record<string, unknown>) => Promise<UserResponse>;
  reload: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const fetchMe = async (): Promise<UserResponse | null> => {
  try {
    const data = await api.get<{ user: UserResponse }>('/auth/me');
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
};

export const Providers = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const user = meQuery.data ?? null;

  // El perfil manda cuando llega la sesión; el tema local cubre el login.
  useEffect(() => {
    if (user?.theme) setThemeState(user.theme);
  }, [user?.theme]);

  useEffect(() => {
    setResolved(applyTheme(theme));
    localStorage.setItem(THEME_KEY, theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setResolved(applyTheme('system'));
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      if (!user) return;
      void api
        .patch<{ user: UserResponse }>('/auth/me', { theme: next })
        .then((data) => queryClient.setQueryData(['me'], data.user))
        .catch(() => {
          /* El tema local ya se aplicó; si falla el guardado se reintenta al volver. */
        });
    },
    [queryClient, user],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<{ user: UserResponse }>('/auth/login', { email, password });
      // Primero fija la sesión y después limpia los datos del usuario anterior:
      // al revés, la consulta «me» se recrea sin datos y puede expulsarnos al login.
      queryClient.setQueryData(['me'], data.user);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: { token: string; display_name: string; password: string }) => {
      const data = await api.post<{ user: UserResponse }>('/auth/register', input);
      queryClient.setQueryData(['me'], data.user);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      // No se usa clear(): elimina la consulta «me» mientras sigue observada y
      // el observador se queda con los datos del usuario anterior. Se anula la
      // sesión en la misma consulta y se descarta el resto.
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    }
  }, [queryClient]);

  const patchProfile = useCallback(
    async (patch: Record<string, unknown>) => {
      const data = await api.patch<{ user: UserResponse }>('/auth/me', patch);
      queryClient.setQueryData(['me'], data.user);
      return data.user;
    },
    [queryClient],
  );

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: meQuery.isPending,
      login,
      register,
      logout,
      patchProfile,
      reload,
    }),
    [login, logout, meQuery.isPending, patchProfile, reload, register, user],
  );

  const themeValue = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolved }),
    [resolved, setTheme, theme],
  );

  return (
    <AuthContext.Provider value={authValue}>
      <ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de Providers');
  return context;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de Providers');
  return context;
};
