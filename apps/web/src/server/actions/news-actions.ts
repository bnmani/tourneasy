'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import { createNews, deleteNews, emailNews, setNewsPublished } from '../services/news-service';
import { formToObject, toFormState } from './form-utils';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

const page = (locale: AppLocale, tournamentId: string) =>
  `/${locale}/admin/tournaments/${tournamentId}/news`;

export async function createNewsAction(
  locale: AppLocale,
  tournamentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await createNews(
      await actorOrThrow(),
      tournamentId,
      formToObject(formData, { booleans: ['publish', 'email'] }),
      await currentRequestMeta(),
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`${page(locale, tournamentId)}?status=saved`);
}

async function act(target: string, okStatus: string, work: () => Promise<unknown>) {
  let status = okStatus;
  try {
    await work();
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[news action] failed', error);
  }
  revalidatePath('/', 'layout');
  redirect(`${target}?status=${status}`);
}

export async function publishNewsAction(
  locale: AppLocale,
  tournamentId: string,
  newsId: string,
  publish: boolean,
) {
  await act(page(locale, tournamentId), 'saved', async () =>
    setNewsPublished(await actorOrThrow(), newsId, publish, await currentRequestMeta()),
  );
}

export async function emailNewsAction(locale: AppLocale, tournamentId: string, newsId: string) {
  await act(page(locale, tournamentId), 'newsEmailed', async () =>
    emailNews(await actorOrThrow(), newsId, await currentRequestMeta()),
  );
}

export async function deleteNewsAction(locale: AppLocale, tournamentId: string, newsId: string) {
  await act(page(locale, tournamentId), 'deleted', async () =>
    deleteNews(await actorOrThrow(), newsId, await currentRequestMeta()),
  );
}
