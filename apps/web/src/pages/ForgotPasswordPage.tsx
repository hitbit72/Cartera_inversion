import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordSchema } from '@cartera/shared';
import { AuthLayout } from '../components/AuthLayout';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { api } from '../lib/api';
import { errorMessage, fieldErrors } from '../lib/forms';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/auth/password/forgot', parsed.data);
      setSent(true);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Recupera tu acceso"
      subtitle="Te enviaremos un enlace para crear una contraseña nueva."
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Volver al inicio de sesión
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-up/30 bg-up/10 p-4 text-sm leading-relaxed text-up">
            Si el correo está registrado, recibirás un mensaje con un enlace. Caduca en una hora.
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Revisa también la carpeta de spam. El enlace solo funciona una vez y te pedirá una
            contraseña nueva.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {message ? <ErrorNote>{message}</ErrorNote> : null}

          <Field label="Correo de la cuenta" error={errors.email}>
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

          <Button type="submit" variant="primary" className="w-full" loading={submitting}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};
