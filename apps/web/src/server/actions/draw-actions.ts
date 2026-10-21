'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import {
  applySuggestedSeeds,
  deleteDraft,
  generateDraw,
  publishDraws,
  setSeeds,
  swapEntries,
} from '../services/draw-service';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

const page = (locale: AppLocale, tournamentId: string, eventId: string) =>
  `/${locale}/admin/tournaments/${tournamentId}/draws/${eventId}`;

async function act(target: string, okStatus: string, work: () => Promise<unknown>) {
  let status = okStatus;
  try {
    await work();
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[draw action] failed', error);
  }
  revalidatePath('/', 'layout');
  redirect(`${target}?status=${status}`);
}

/** Seed table: one number field per entry, named seed.<registrationId>. */
export async function saveSeedsAction(
  locale: AppLocale,
  tournamentId: string,
  eventId: string,
  formData: FormData,
) {
  await act(page(locale, tournamentId, eventId), 'saved', async () => {
    const seeds = [...formData.entries()]
      .filter(([k]) => k.startsWith('seed.'))
      .map(([k, v]) => ({
        registrationId: k.slice(5),
        seed: typeof v === 'string' && v.trim() !== '' ? Number(v) : null,
      }));
    await setSeeds(await actorOrThrow(), eventId, { seeds }, await currentRequestMeta());
  });
}

export async function suggestSeedsAction(
  locale: AppLocale,
  tournamentId: string,
  eventId: string,
  formData: FormData,
) {
  await act(page(locale, tournamentId, eventId), 'saved', async () =>
    applySuggestedSeeds(
      await actorOrThrow(),
      eventId,
      Number(formData.get('count') ?? 0) || 0,
      await currentRequestMeta(),
    ),
  );
}

export async function generateDrawAction(locale: AppLocale, tournamentId: string, eventId: string) {
  await act(page(locale, tournamentId, eventId), 'drawGenerated', async () =>
    generateDraw(await actorOrThrow(), eventId, await currentRequestMeta()),
  );
}

export async function swapEntriesAction(
  locale: AppLocale,
  tournamentId: string,
  eventId: string,
  formData: FormData,
) {
  await act(page(locale, tournamentId, eventId), 'saved', async () =>
    swapEntries(
      await actorOrThrow(),
      eventId,
      { a: formData.get('a'), b: formData.get('b') },
      await currentRequestMeta(),
    ),
  );
}

export async function publishDrawAction(
  locale: AppLocale,
  tournamentId: string,
  eventId: string,
  publish: boolean,
) {
  await act(
    page(locale, tournamentId, eventId),
    publish ? 'drawPublished' : 'drawUnpublished',
    async () => publishDraws(await actorOrThrow(), eventId, publish, await currentRequestMeta()),
  );
}

export async function deleteDraftAction(locale: AppLocale, tournamentId: string, eventId: string) {
  await act(page(locale, tournamentId, eventId), 'deleted', async () =>
    deleteDraft(await actorOrThrow(), eventId, await currentRequestMeta()),
  );
}
