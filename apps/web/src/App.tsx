import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './app/providers';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { AssetsPage } from './pages/AssetsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DividendsPage } from './pages/DividendsPage';
import { ImportPage } from './pages/ImportPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

const FullScreenLoading = () => (
  <div className="flex min-h-dvh items-center justify-center gap-3 text-sm text-muted">
    <Spinner />
    Cargando tu cartera…
  </div>
);

/** Rutas privadas: sin sesión se vuelve al login conservando el destino. */
const Protected = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoading />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};

/** Login y registro: con sesión activa no tiene sentido mostrarlos. */
const PublicOnly = () => {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
};

export const App = () => (
  <Routes>
    <Route element={<PublicOnly />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
    </Route>

    {/* El restablecimiento se abre también con sesión activa: los tokens
        viajan en el hash y la propia pantalla decide qué hacer. */}
    <Route path="/restablecer" element={<ResetPasswordPage />} />

    <Route element={<Protected />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/operaciones" element={<TransactionsPage />} />
      <Route path="/importar" element={<ImportPage />} />
      <Route path="/dividendos" element={<DividendsPage />} />
      <Route path="/activos" element={<AssetsPage />} />
      <Route path="/activos/:id" element={<AssetDetailPage />} />
      <Route path="/ajustes" element={<SettingsPage />} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
