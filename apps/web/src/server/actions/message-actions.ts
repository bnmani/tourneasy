'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import type { MessageFormState } from '@/components/admin/push-message-form';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError } from '../lib/errors';
import { messageAllAppUsers, messageFoodWaiting } from '../services/message-service';
import { formToObject, toFormState } from './form-utils';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** "Your food is ready": to everyone whose order is still to be handed out. */
export async function messageFoodWaitingAction(
  locale: AppLocale,
  tournamentId: string,
  _prev: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  try {
    const result = await messageFoodWaiting(
      await actorOrThrow(),
      tournamentId,
      formToObject(formData),
      await currentRequestMeta(),
    );
    revalidatePath(`/${locale}/admin/tournaments/${tournamentId}/food`);
    return { ok: true, sent: { ...result, test: false } };
  } catch (error) {
    return toFormState(error, formData);
  }
}

/** A message to all app users; the "test" button sends it to the admin only. */
export async function messageAllAppUsersAction(
  locale: AppLocale,
  _prev: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const test = formData.get('mode') === 'test';
  try {
    const result = await messageAllAppUsers(
      await actorOrThrow(),
      formToObject(formData, { booleans: ['confirmed'] }),
      { test },
      await currentRequestMeta(),
    );
    revalidatePath(`/${locale}/admin/messages`);
    // Keep the text after a test, so the same message can then go to everyone.
    const values = test
      ? { title: String(formData.get('title') ?? ''), body: String(formData.get('body') ?? '') }
      : undefined;
    return { ok: true, sent: { ...result, test }, values };
  } catch (error) {
    return toFormState(error, formData);
  }
}
