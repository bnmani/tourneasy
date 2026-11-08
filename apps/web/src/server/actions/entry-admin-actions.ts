'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import { addEntryAsOrganiser, searchPlayersForEntry } from '../services/entry-import-service';
import { changePartner, type PartnerChangePreview } from '../services/partner-change-service';
import { toFormState } from './form-utils';

export type EntryPlayerOption = {
  memberNumber: string;
  name: string;
  club: string | null;
  born: number | null;
  /** Already in this category (change partner, D115): who they play with now. */
  entered?: { with: string | null; withPaid: boolean };
};

/** Live player search on the add-entry form (organisers of this tournament). */
export async function searchPlayersForEntryAction(
  tournamentId: string,
  eventId: string,
  query: string,
  partnerOf?: string,
  includeEntered = false,
): Promise<EntryPlayerOption[]> {
  const actor = await getActor();
  if (!actor) return [];
  try {
    return await searchPlayersForEntry(
      actor,
      tournamentId,
      eventId,
      query,
      partnerOf,
      includeEntered,
    );
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
      locale,
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

export type ChangePartnerState = FormState & {
  preview?: PartnerChangePreview;
  done?: { name: string; event: string };
  duplicates?: { player: EntryPlayerOption[]; partner: EntryPlayerOption[] };
};

/** Change partner (D115): the first submit checks and previews, "Confirm change" saves. */
export async function changePartnerAction(
  locale: AppLocale,
  tournamentId: string,
  registrationId: string,
  prev: ChangePartnerState,
  formData: FormData,
): Promise<ChangePartnerState> {
  try {
    const actor = await getActor();
    if (!actor) throw new AppError('unauthorized');
    const partner = pick(formData, 'partner');
    if (!partner) throw new AppError('validation', { fields: { partner: 'required' } });
    const leftBehind = formData.get('leftBehind');
    const result = await changePartner(
      actor,
      registrationId,
      {
        partner,
        allowNew: formData.get('allowNew') === '1',
        leftBehind: leftBehind === 'keep' || leftBehind === 'cancel' ? leftBehind : undefined,
        notify: formData.get('notify') === 'on',
        confirm: formData.get('confirm') === '1',
      },
      await currentRequestMeta(),
      locale,
    );
    if ('done' in result) {
      revalidatePath(`/${locale}/admin/tournaments/${tournamentId}/entries`);
      return { ok: true, done: result.done };
    }
    // Keep what was typed (a new player's details) for the confirm step: React resets the form.
    const values: Record<string, string> = {};
    for (const [k, v] of formData) if (typeof v === 'string') values[k] = v;
    return { ok: true, preview: result.preview, values };
  } catch (error) {
    const duplicates =
      isAppError(error) && error.code === 'possibleDuplicate'
        ? { player: [], ...(error.details.duplicates as { partner: EntryPlayerOption[] }) }
        : undefined;
    return { ...toFormState(error, formData), duplicates };
  }
}
