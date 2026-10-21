'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import {
  cancelEntryAsOrganiser,
  enterTournament,
  invitePartner,
  respondToInvite,
  withdrawMyRegistration,
  type InviteRef,
} from '../services/registration-service';
import { toFormState } from './form-utils';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** Runs a button action and reports the outcome as ?status=… on `target`. */
async function act(target: string, okStatus: string, work: () => Promise<unknown>) {
  let status = okStatus;
  try {
    await work();
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[registration action] failed', error);
  }
  revalidatePath('/', 'layout');
  redirect(`${target}${target.includes('?') ? '&' : '?'}status=${status}`);
}

/** Entry form: events[] (eventId), partner.<eventId>, looking.<eventId>, phone, acceptTerms. */
export async function enterAction(
  locale: AppLocale,
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const actor = await actorOrThrow();
    const ids = formData.getAll('eventId').filter((v): v is string => typeof v === 'string');
    const input = {
      events: ids.map((eventId) => ({
        eventId,
        partner: formData.get(`partner.${eventId}`) ?? undefined,
        lookingForPartner: formData.get(`looking.${eventId}`) === 'on',
      })),
      phone: formData.get('phone') ?? undefined,
      acceptTerms: formData.get('acceptTerms') === 'on',
    };
    await enterTournament(actor, slug, input, await currentRequestMeta());
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`/${locale}/account?tab=upcoming&status=entered`);
}

export async function withdrawAction(
  locale: AppLocale,
  registrationId: string,
  formData: FormData,
) {
  await act(`/${locale}/account?tab=upcoming`, 'withdrawn', async () =>
    withdrawMyRegistration(
      await actorOrThrow(),
      registrationId,
      { reason: formData.get('reason') ?? undefined },
      await currentRequestMeta(),
    ),
  );
}

export async function invitePartnerAction(
  locale: AppLocale,
  registrationId: string,
  formData: FormData,
) {
  await act(`/${locale}/account?tab=upcoming`, 'partnerInvited', async () =>
    invitePartner(
      await actorOrThrow(),
      registrationId,
      formData.get('partner'),
      await currentRequestMeta(),
    ),
  );
}

export async function respondInviteAction(locale: AppLocale, ref: InviteRef, accept: boolean) {
  await act(
    `/${locale}/account?tab=upcoming`,
    accept ? 'inviteAccepted' : 'inviteDeclined',
    async () => respondToInvite(await actorOrThrow(), ref, accept, await currentRequestMeta()),
  );
}

export async function cancelEntryAction(
  locale: AppLocale,
  tournamentId: string,
  registrationId: string,
  formData: FormData,
) {
  await act(`/${locale}/admin/tournaments/${tournamentId}/entries`, 'cancelled', async () =>
    cancelEntryAsOrganiser(
      await actorOrThrow(),
      registrationId,
      { reason: formData.get('reason') ?? undefined },
      await currentRequestMeta(),
    ),
  );
}
