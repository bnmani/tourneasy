'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import { addEntryAsOrganiser, searchPlayersForEntry } from '../services/entry-import-service';
import { toFormState } from './form-utils';

export type EntryPlayerOption = {
  memberNumber: string;
  name: string;
  club: string | null;
  born: number;
};

/** Live player search on the add-entry form (organisers of this tournament). */
export async function searchPlayersForEntryAction(
  tournamentId: string,
  eventId: string,
  query: string,
  partnerOf?: string,
): Promise<EntryPlayerOption[]> {
  const actor = await getActor();
  if (!actor) return [];
  try {
    return await searchPlayersForEntry(actor, tournamentId, eventId, query, partnerOf);
  } catch (error) {
    if (!isAppError(error)) console.error('[entry search] failed', error);
    return [];
  }
}

export type AddEntryState = FormState & {
  added?: { name: string; event: string; status: string; count: number };
  /** Existing players with the name of a new one (D82): pick one, or add anyway. */
  duplicates?: { player: EntryPlayerOption[]; partner: EntryPlayerOption[] };
};

/** One player picked from the list (member number) or new (details), as form fields. */
function pick(formData: FormData, prefix: 'player' | 'partner') {
  const number = formData.get(`${prefix}.memberNumber`);
  if (typeof number === 'string' && number) return { memberNumber: number };
  if (formData.get(`${prefix}.mode`) !== 'new') return undefined;
  const v = (k: string) => {
    const x = formData.get(`${prefix}.new.${k}`);
    return typeof x === 'string' && x.trim() ? x.trim() : undefined;
  };
  return {
    new: {
      firstName: v('firstName') ?? '',
      lastNamePrefix: v('lastNamePrefix'),
      lastName: v('lastName') ?? '',
      gender: v('gender') ?? '',
      dateOfBirth: v('dateOfBirth') ?? '',
      email: v('email'),
    },
  };
}

export async function addEntryAction(
  locale: AppLocale,
  tournamentId: string,
  prev: AddEntryState,
  formData: FormData,
): Promise<AddEntryState> {
  try {
    const actor = await getActor();
    if (!actor) throw new AppError('unauthorized');
    const player = pick(formData, 'player');
    if (!player) throw new AppError('validation', { fields: { player: 'required' } });
    const result = await addEntryAsOrganiser(
      actor,
      tournamentId,
      {
        eventId: formData.get('eventId'),
        player,
        partner: pick(formData, 'partner'),
        allowNew: formData.get('allowNew') === '1',
      },
      await currentRequestMeta(),
    );
    revalidatePath(`/${locale}/admin/tournaments/${tournamentId}/entries`);
    return { ok: true, added: { ...result, count: (prev.added?.count ?? 0) + 1 } };
  } catch (error) {
    const duplicates =
      isAppError(error) && error.code === 'possibleDuplicate'
        ? (error.details.duplicates as AddEntryState['duplicates'])
        : undefined;
    return { ...toFormState(error, formData), added: prev.added, duplicates };
  }
}
