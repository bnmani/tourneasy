import type { Prisma } from '@tourneasy/db';
import { AppError } from './errors';

/**
 * A match with umpire events is a scored match: its log cannot be deleted (the database refuses
 * it with Restrict). Call this before deleting matches, directly or through their draw, so the
 * desk gets a clear refusal instead of an unexpected 500. Matches without events are untouched.
 */
export async function assertNoUmpireEvents(
  tx: Prisma.TransactionClient,
  where: Prisma.MatchWhereInput,
): Promise<void> {
  const scored = await tx.umpireEvent.count({ where: { match: where } });
  if (scored > 0) throw new AppError('matchHasUmpireEvents');
}
