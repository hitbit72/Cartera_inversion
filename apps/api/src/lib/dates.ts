import { isValidIsoDate } from '@cartera/shared';

const DAY_MS = 86_400_000;

export const toUtcDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const todayIso = (): string => toIsoDate(new Date());

export const addDays = (iso: string, days: number): string =>
  toIsoDate(new Date(toUtcDate(iso).getTime() + days * DAY_MS));

export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS);

export const isWeekend = (iso: string): boolean => {
  const day = toUtcDate(iso).getUTCDay();
  return day === 0 || day === 6;
};

/** Lista inclusiva de fechas ISO entre `from` y `to`. */
export const eachDay = (from: string, to: string): string[] => {
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return [];
  const days: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 50_000) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
};

export const minIso = (a: string | null | undefined, b: string): string =>
  a && a < b ? a : b;

export const maxIso = (a: string | null | undefined, b: string): string =>
  a && a > b ? a : b;

export const yearKey = (iso: string): string => iso.slice(0, 4);

export const monthKey = (iso: string): string => iso.slice(0, 7);

export const nowIso = (): string => new Date().toISOString();
