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

export function pageParams(page: number | undefined) {
  const current = Math.max(1, Math.floor(page ?? 1) || 1);
  return { page: current, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
