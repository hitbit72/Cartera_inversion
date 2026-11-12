/**
 * Traduce los errores de validación de zod a un mapa campo → mensaje.
 * Se evita depender del tipo de zod en el frontend: comparten la forma.
 */
export const fieldErrors = (
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '(cuerpo)';
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
};

export const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
};
