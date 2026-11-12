import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerSchema } from '@cartera/shared';
import { useAuth } from '../app/providers';
import { AuthLayout } from '../components/AuthLayout';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { ApiError } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';

const INVITATION_MESSAGES: Record<string, string> = {
  INVITATION_INVALID: 'El enlace de invitación no es válido. Pide uno nuevo al administrador.',
  INVITATION_USED: 'Esta invitación ya se ha usado. Si olvidaste la contraseña, puedes recuperarla.',
  INVITATION_EXPIRED: 'La invitación ha caducado. Pide una nueva al administrador.',
};

const MIN_PASSWORD = 12;

export const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const parsed = registerSchema.safeParse({
      token,
      display_name: displayName,
      password,
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
      await register(parsed.data);
      setDone(true);
      // La sesión ya está creada: el dashboard es el siguiente paso.
      window.setTimeout(() => navigate('/', { replace: true }), 900);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(INVITATION_MESSAGES[error.code] ?? error.message);
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="Enlace no válido"
        subtitle="Este registro necesita una invitación."
        footer={
          <Link to="/login" className="font-medium text-accent hover:underline">
            Volver al inicio de sesión
          </Link>
        }
      >
        <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm leading-relaxed text-muted">
          Abre el enlace completo que recibiste por correo. Debe incluir el parámetro{' '}
          <code className="rounded bg-line/60 px-1 py-0.5 text-ink">token</code>.
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Cuenta creada" subtitle="Ya puedes empezar a registrar tus inversiones.">
        <div className="rounded-xl border border-up/30 bg-up/10 p-4 text-sm text-up">
          Todo listo. Te llevamos al resumen de tu cartera…
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Acepta la invitación y elige cómo quieres entrar."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {message ? <ErrorNote>{message}</ErrorNote> : null}

        <Field
          label="Tu nombre"
          error={errors.display_name}
          hint="Aparecerá en el menú de la aplicación."
        >
          <Input
            name="display_name"
            autoComplete="name"
            placeholder="Ana García"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoFocus
          />
        </Field>

        <Field
          label="Contraseña"
          error={errors.password}
          hint={`Al menos ${MIN_PASSWORD} caracteres. Usa mayúsculas, minúsculas y números.`}
        >
          <Input
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
          Crear cuenta
        </Button>
      </form>

      <p className="mt-5 text-[11px] leading-relaxed text-muted">
        Al crear la cuenta aceptas que tus datos se guarden únicamente para gestionar tu cartera.
        Cada usuario ve solo sus propias operaciones.
      </p>
    </AuthLayout>
  );
};
