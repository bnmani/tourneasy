import { fieldErrors } from '@tourneasy/shared';
import type { z } from 'zod';
import { validationError } from './errors';

/** Parses service input; throws a `validation` AppError with field error keys. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(fieldErrors(result.error));
  return result.data;
}

export const PAGE_SIZE = 25;

/** Page sizes a list may offer (players list, D104). */
export const PAGE_SIZES = [25, 50, 75, 100] as const;

/** A requested page size if it's one of PAGE_SIZES, otherwise the default (D112). */
export function pageSize(requested: number | undefined): number {
  return (PAGE_SIZES as readonly number[]).includes(requested ?? 0) ? requested! : PAGE_SIZE;
}

export function pageParams(page: number | undefined, size: number = PAGE_SIZE) {
  const current = Math.max(1, Math.floor(page ?? 1) || 1);
  return { page: current, skip: (current - 1) * size, take: size };
}

export function pageCount(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
