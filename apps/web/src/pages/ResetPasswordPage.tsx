import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { resetPasswordSchema } from '@cartera/shared';
import { AuthLayout } from '../components/AuthLayout';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';

interface RecoveryTokens {
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
}

/** Supabase devuelve los tokens de recuperación en el hash de la URL. */
const readTokens = (hash: string): RecoveryTokens => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    error: params.get('error_description') ?? params.get('error'),
  };
};

export const ResetPasswordPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const tokens = useMemo(() => readTokens(location.hash), [location.hash]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const valid = Boolean(tokens.accessToken && tokens.refreshToken);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const parsed = resetPasswordSchema.safeParse({
      access_token: tokens.accessToken ?? '',
      refresh_token: tokens.refreshToken ?? '',
      new_password: password,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    if (password !== confirm) {
      setErrors({ confirm: 'Las contraseñas no coinciden.' });
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/auth/password/reset', parsed.data);
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 1400);
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(
          error.code === 'RESET_TOKEN_INVALID'
            ? 'El enlace ha caducado o ya se usó. Solicita uno nuevo.'
            : error.message,
        );
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!valid || tokens.error) {
    return (
      <AuthLayout
        title="Enlace no válido"
        subtitle="Este enlace de recuperación ha caducado o ya se usó."
        footer={
          <Link to="/login" className="font-medium text-accent hover:underline">
            Volver al inicio de sesión
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm leading-relaxed text-muted">
            Los enlaces de recuperación caducan y solo sirven una vez. Pide uno nuevo desde la
            pantalla de recuperación.
          </div>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => navigate('/recuperar', { replace: true })}
          >
            Pedir otro enlace
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        title="Contraseña actualizada"
        subtitle="Ya puedes entrar con la contraseña nueva."
      >
        <div className="rounded-xl border border-up/30 bg-up/10 p-4 text-sm text-up">
          Cambio guardado. Te llevamos al inicio de sesión…
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      subtitle="Elige una contraseña que no uses en otros servicios."
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Volver al inicio de sesión
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {message ? <ErrorNote>{message}</ErrorNote> : null}

        <Field
          label="Contraseña nueva"
          error={errors.new_password}
          hint="Mínimo 12 caracteres, con mayúsculas, minúsculas y números."
        >
          <Input
            type="password"
            name="new_password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Repite la contraseña" error={errors.confirm}>
          <Input
            type="password"
            name="confirm"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" className="w-full" loading={submitting}>
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  );
};
