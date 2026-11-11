import { isValidIsoDate } from '@cartera/shared';
import { AppError } from './errors.js';

export interface Cursor {
  date: string;
  id: string;
}

export const encodeCursor = (date: string, id: string): string =>
  Buffer.from(`${date}|${id}`, 'utf8').toString('base64url');

export const decodeCursor = (cursor: string): Cursor => {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'El cursor no es válido.', {
      errors: [{ field: 'cursor', message: 'Cursor mal formado.' }],
    });
  }

  const [date, id, ...rest] = decoded.split('|');
  if (rest.length > 0 || !date || !id || !isValidIsoDate(date) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'El cursor no es válido.', {
      errors: [{ field: 'cursor', message: 'Cursor mal formado.' }],
    });
  }

  return { date, id };
};
