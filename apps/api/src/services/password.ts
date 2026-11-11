import { validationError } from '../lib/errors.js';

/**
 * Comprobación de fortaleza sin dependencias pesadas:
 * longitud, variedad de caracteres y que no contenga el email o el nombre.
 * Supabase Auth aplica además sus propias reglas.
 */
export const assertPasswordStrength = (password: string, email?: string | null, name?: string | null): void => {
  const problems: Array<{ field: string; message: string }> = [];
  const lower = password.toLowerCase();

  const localPart = email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
    problems.push({ field: 'password', message: 'La contraseña no puede contener el correo.' });
  }
  if (name && name.trim().length >= 3 && lower.includes(name.trim().toLowerCase())) {
    problems.push({ field: 'password', message: 'La contraseña no puede contener tu nombre.' });
  }
  if (new Set(password).size < 6) {
    problems.push({ field: 'password', message: 'La contraseña repite demasiados caracteres.' });
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (classes < 3) {
    problems.push({
      field: 'password',
      message: 'Usa al menos tres tipos de caracteres: minúsculas, mayúsculas, números o símbolos.',
    });
  }

  if (problems.length > 0) throw validationError(problems);
};
