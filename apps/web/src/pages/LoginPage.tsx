import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@cartera/shared';
import { useAuth } from '../app/providers';
import { AuthLayout } from '../components/AuthLayout';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { ApiError } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setMessage(
          error.code === 'RATE_LIMITED'
            ? 'Demasiados intentos. Espera unos minutos antes de volver a probar.'
            : error.message,
        );
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Tu cartera, tus números. Acceso privado con invitación."
      footer={
        <>
          ¿Olvidaste la contraseña?{' '}
          <Link to="/recuperar" className="font-medium text-accent hover:underline">
            Recupérala
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {message ? <ErrorNote>{message}</ErrorNote> : null}

        <Field label="Correo" error={errors.email}>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Contraseña" error={errors.password}>
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" className="w-full" loading={submitting}>
          Entrar
        </Button>
      </form>

      <p className="mt-6 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
        El registro está cerrado. Si te han invitado, abre el enlace que recibiste por correo para
        crear tu cuenta.
      </p>
    </AuthLayout>
  );
};
