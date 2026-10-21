'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError, type ErrorCode } from '../lib/errors';
import { createCheckout, markShareAsPaid } from '../services/payment-service';
import { approveRefund, rejectRefund } from '../services/refund-service';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

export type CheckoutResult =
  | {
      ok: true;
      orderId: string | null;
      orderNumber: string | null;
      amountCents: number;
      clientSecret: string | null;
      publishableKey: string;
    }
  | { ok: false; error: ErrorCode };

/** Opens (or reuses) the order for my unpaid shares; the dialog then shows Stripe's form. */
export async function startCheckoutAction(participantIds: string[]): Promise<CheckoutResult> {
  try {
    const result = await createCheckout(await actorOrThrow(), { participantIds });
    if (!result.clientSecret) revalidatePath('/', 'layout'); // fully covered by a discount
    return { ok: true, ...result };
  } catch (error) {
    if (!isAppError(error)) console.error('[payment action] checkout failed', error);
    return { ok: false, error: isAppError(error) ? error.code : 'unexpected' };
  }
}

async function act(target: string, okStatus: string, work: () => Promise<unknown>) {
  let status = okStatus;
  try {
    await work();
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[payment action] failed', error);
  }
  revalidatePath('/', 'layout');
  redirect(`${target}${target.includes('?') ? '&' : '?'}status=${status}`);
}

/** Organiser: a share was paid at the desk (cash / transfer). */
export async function markPaidAction(
  locale: AppLocale,
  tournamentId: string,
  participantId: string,
) {
  await act(`/${locale}/admin/tournaments/${tournamentId}/entries`, 'markedPaid', async () =>
    markShareAsPaid(await actorOrThrow(), { participantId }, await currentRequestMeta()),
  );
}

export async function refundDecisionAction(locale: AppLocale, refundId: string, approve: boolean) {
  await act(
    `/${locale}/admin/payments`,
    approve ? 'refundApproved' : 'refundRejected',
    async () => {
      const actor = await actorOrThrow();
      const meta = await currentRequestMeta();
      return approve ? approveRefund(actor, refundId, meta) : rejectRefund(actor, refundId, meta);
    },
  );
}
