'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import { moderateFeedback, submitFeedback } from '../services/feedback-service';
import { formToObject, toFormState } from './form-utils';

/** A player sends feedback for a tournament page. */
export async function submitFeedbackAction(
  locale: AppLocale,
  tournamentId: string,
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const actor = await getActor();
    if (!actor) throw new AppError('unauthorized');
    const data = formToObject(formData, { booleans: ['shareConsent'] });
    await submitFeedback(
      actor,
      tournamentId,
      {
        rating: data.rating,
        comment: data.comment,
        shareConsent: data.shareConsent === true,
      },
      await currentRequestMeta(),
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath(`/${locale}/tournaments/${slug}`);
  redirect(`/${locale}/tournaments/${slug}?feedback=sent#feedback`);
}

const adminPage = (locale: AppLocale, tournamentId: string) =>
  `/${locale}/admin/tournaments/${tournamentId}/feedback`;

/** An organiser or admin chooses where a comment shows. */
export async function moderateFeedbackAction(
  locale: AppLocale,
  tournamentId: string,
  feedbackId: string,
  status: 'TOURNAMENT' | 'WEBSITE' | 'PRIVATE' | 'REJECTED',
) {
  let outcome = 'saved';
  try {
    const actor = await getActor();
    if (!actor) throw new AppError('unauthorized');
    await moderateFeedback(actor, feedbackId, status, await currentRequestMeta());
  } catch (error) {
    outcome = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[feedback action] failed', error);
  }
  revalidatePath('/', 'layout');
  redirect(`${adminPage(locale, tournamentId)}?status=${outcome}`);
}

const TABS = ['new', 'published', 'private', 'rejected'] as const;

/** From the inbox: choose where a comment shows, then return to the same tab and tournament. */
export async function moderateFromInboxAction(
  locale: AppLocale,
  feedbackId: string,
  status: 'TOURNAMENT' | 'WEBSITE' | 'PRIVATE' | 'REJECTED',
  tab: string,
  tournamentId: string,
) {
  let outcome = 'saved';
  try {
    const actor = await getActor();
    if (!actor) throw new AppError('unauthorized');
    await moderateFeedback(actor, feedbackId, status, await currentRequestMeta());
  } catch (error) {
    outcome = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[feedback inbox] failed', error);
  }
  const safeTab = (TABS as readonly string[]).includes(tab) ? tab : 'new';
  const safeTournament = /^[0-9a-f-]{36}$/.test(tournamentId) ? tournamentId : '';
  const query = new URLSearchParams({ tab: safeTab, status: outcome });
  if (safeTournament) query.set('tournament', safeTournament);
  revalidatePath('/', 'layout');
  redirect(`/${locale}/admin/feedback?${query.toString()}`);
}
