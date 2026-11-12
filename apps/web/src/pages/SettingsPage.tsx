import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { CostMethod, Currency, Theme } from '@cartera/shared';
import {
  COST_METHODS,
  CURRENCIES,
  changePasswordSchema,
  profilePatchSchema,
} from '@cartera/shared';
import { useAuth, useTheme } from '../app/providers';
import { PageHeader } from '../components/PageHeader';
import {
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Field,
  Input,
  Segmented,
  Select,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';
import { formatDate } from '../lib/format';

const COST_OPTIONS: Array<{ value: CostMethod; label: string }> = [
  { value: 'FIFO', label: 'FIFO' },
  { value: 'AVERAGE', label: 'Coste medio' },
];

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'dark', label: 'Oscuro' },
  { value: 'light', label: 'Claro' },
  { value: 'system', label: 'Sistema' },
];

export const SettingsPage = () => {
  const { user, patchProfile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [baseCurrency, setBaseCurrency] = useState<Currency>(user?.base_currency ?? 'EUR');
  const [costMethod, setCostMethod] = useState<CostMethod>(user?.cost_method ?? 'FIFO');
  const [benchmark, setBenchmark] = useState(user?.benchmark_symbol ?? '');
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordOk, setPasswordOk] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileMessage(null);
    setProfileOk(null);

    const parsed = profilePatchSchema.safeParse({
      display_name: displayName,
      base_currency: baseCurrency,
      cost_method: costMethod,
      benchmark_symbol: benchmark.trim() === '' ? null : benchmark.trim(),
    });
    if (!parsed.success) {
      setProfileErrors(fieldErrors(parsed.error.issues));
      return;
    }

    setProfileErrors({});
    setSavingProfile(true);
    try {
      await patchProfile(parsed.data);
      // La divisa base afecta a todos los cálculos: se recargan las vistas.
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      await queryClient.invalidateQueries({ queryKey: ['history'] });
      await queryClient.invalidateQueries({ queryKey: ['allocation'] });
      await queryClient.invalidateQueries({ queryKey: ['performance'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['dividends'] });
      await queryClient.invalidateQueries({ queryKey: ['dividends-summary'] });
      setProfileOk('Preferencias guardadas.');
    } catch (error) {
      if (error instanceof ApiError) {
        setProfileErrors(error.fields);
        setProfileMessage(error.message);
      } else {
        setProfileMessage(errorMessage(error));
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordOk(null);

    const parsed = changePasswordSchema.safeParse({
      current_password: currentPassword,
      new_password: newPassword,
    });
    if (!parsed.success) {
      setPasswordErrors(fieldErrors(parsed.error.issues));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrors({ confirm_password: 'Las contraseñas no coinciden.' });
      return;
    }

    setPasswordErrors({});
    setSavingPassword(true);
    try {
      await api.post('/auth/password', parsed.data);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordOk('Contraseña actualizada.');
    } catch (error) {
      if (error instanceof ApiError) {
        setPasswordErrors(error.fields);
        setPasswordMessage(error.message);
      } else {
        setPasswordMessage(errorMessage(error));
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="animate-rise space-y-5">
      <PageHeader
        title="Ajustes"
        description="Tu perfil, la divisa base de los cálculos, el método de coste y la seguridad de la cuenta."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Perfil y preferencias"
            subtitle="La divisa base convierte todos los importes de la cartera."
          />
          <form onSubmit={saveProfile} className="space-y-4" noValidate>
            {profileMessage ? <ErrorNote>{profileMessage}</ErrorNote> : null}
            {profileOk ? (
              <div className="rounded-lg border border-up/30 bg-up/10 px-3 py-2 text-xs text-up">
                {profileOk}
              </div>
            ) : null}

            <Field label="Nombre" error={profileErrors.display_name}>
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Divisa base"
                error={profileErrors.base_currency}
                hint="Se usa para valorar y comparar toda la cartera."
              >
                <Select
                  value={baseCurrency}
                  onChange={(event) => setBaseCurrency(event.target.value as Currency)}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Índice de referencia"
                error={profileErrors.benchmark_symbol}
                hint="Símbolo de Yahoo Finance. Vacío para desactivar."
              >
                <Input
                  value={benchmark}
                  onChange={(event) => setBenchmark(event.target.value.toUpperCase())}
                  placeholder="URTH"
                />
              </Field>
            </div>

            <Field label="Método de coste" error={profileErrors.cost_method}>
              <Segmented
                options={COST_OPTIONS}
                value={costMethod}
                onChange={setCostMethod}
              />
              <span className="mt-1.5 block text-xs text-muted">
                {costMethod === 'FIFO'
                  ? 'FIFO vende primero las compras más antiguas. Es el método por defecto y el habitual en España.'
                  : 'Coste medio reparte el coste entre todas las unidades compradas. Cambia las plusvalías de las ventas.'}
              </span>
            </Field>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={savingProfile}>
                Guardar preferencias
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Apariencia"
              subtitle="Se guarda en tu perfil, así que se mantiene al entrar desde otro dispositivo."
            />
            <Field label="Tema">
              <Segmented options={THEME_OPTIONS} value={theme} onChange={setTheme} />
            </Field>
            <p className="mt-2 text-xs text-muted">
              «Sistema» sigue la preferencia del dispositivo. Los importes usan verde para
              ganancias y rojo para pérdidas en ambos temas.
            </p>
          </Card>

          <Card>
            <CardHeader title="Cuenta y sesión" />
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs uppercase tracking-wider text-muted">Correo</dt>
                <dd className="truncate text-right text-ink">{user?.email ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs uppercase tracking-wider text-muted">Cuenta</dt>
                <dd className="text-right text-ink">{user?.account?.name ?? 'Mi cartera'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs uppercase tracking-wider text-muted">Alta</dt>
                <dd className="text-right text-ink">{formatDate(user?.created_at)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-xs text-muted">Cierra la sesión en este navegador.</p>
              <Button variant="danger" onClick={() => void signOut()}>
                Cerrar sesión
              </Button>
            </div>
          </Card>
        </div>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Cambiar contraseña"
            subtitle="Se comprueba la contraseña actual. Mínimo 12 caracteres."
          />
          <form onSubmit={savePassword} className="space-y-4" noValidate>
            {passwordMessage ? <ErrorNote>{passwordMessage}</ErrorNote> : null}
            {passwordOk ? (
              <div className="rounded-lg border border-up/30 bg-up/10 px-3 py-2 text-xs text-up">
                {passwordOk}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Contraseña actual" error={passwordErrors.current_password}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field label="Contraseña nueva" error={passwordErrors.new_password}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
              <Field label="Repite la nueva" error={passwordErrors.confirm_password}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={savingPassword}>
                Actualizar contraseña
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader title="Privacidad y datos" />
        <ul className="grid gap-2 text-xs leading-relaxed text-muted sm:grid-cols-2">
          <li>
            · Tus operaciones, dividendos y activos están aislados por usuario en la base de datos.
            Nadie más puede leerlos ni modificarlos.
          </li>
          <li>
            · Las contraseñas se guardan con hash; esta aplicación nunca las almacena en claro.
          </li>
          <li>
            · Los precios vienen de Yahoo Finance y pueden retrasarse. El dashboard avisa cuando un
            dato está desactualizado.
          </li>
          <li>
            · Los tipos de cambio se guardan con cada operación para que los cálculos históricos no
            cambien con el tiempo.
          </li>
        </ul>
      </Card>
    </div>
  );
};
