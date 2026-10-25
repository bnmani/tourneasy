'use server';

/**
 * Server actions for the admin/organiser portal: FormData → service → redirect.
 * Authorization happens in the services; actions only resolve the actor.
 */
import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { setClubArchived, createClub, updateClub } from '../services/club-service';
import { createEvent, deleteEvent, updateEvent } from '../services/event-service';
import { LOGO_MAX_BYTES, removeTournamentLogo, setTournamentLogo } from '../services/logo-service';
import { importTournamentEntries, type EntryImportResult } from '../services/entry-import-service';
import {
  createPlayer,
  importPlayersFile,
  mergePlayers,
  updatePlayer,
  type ImportResult,
  removePlayers,
} from '../services/player-service';
import type { Actor } from '../services/session-service';
import { safeRedirectPath } from '../lib/urls';
import {
  addOrganiser,
  changeTournamentStatus,
  createTournament,
  removeOrganiser,
  setTournamentPublished,
  updateTournament,
} from '../services/tournament-service';
import { invitePlayers } from '../services/player-invite-service';
import { setSiteTheme } from '../services/site-settings-service';
import { createVenue, setVenueArchived, updateVenue } from '../services/venue-service';
import { formToObject, toFormState } from './form-utils';

async function actorOrThrow(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** Runs `work` and redirects to the path it returns; errors become form state. */
/** Moves `prefix.field` keys into a nested `prefix` object (inline sub-forms). */
function withPrefixed(input: Record<string, unknown>, prefix: string) {
  const nested: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith(`${prefix}.`)) nested[key.slice(prefix.length + 1)] = value;
    else rest[key] = value;
  }
  return { ...rest, [prefix]: nested };
}

async function submit(
  formData: FormData,
  work: (actor: Actor, meta: RequestMeta) => Promise<string>,
): Promise<FormState> {
  let target: string;
  try {
    target = await work(await actorOrThrow(), await currentRequestMeta());
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(target);
}

/** For button forms without form state: outcome via ?status=… on the target page. */
async function act(
  target: string,
  work: (actor: Actor, meta: RequestMeta) => Promise<unknown>,
  okStatus = 'saved',
) {
  let status = okStatus;
  try {
    await work(await actorOrThrow(), await currentRequestMeta());
  } catch (error) {
    status = error instanceof AppError ? error.code : 'unexpected';
    if (!(error instanceof AppError)) console.error('[admin action] failed', error);
  }
  revalidatePath('/', 'layout');
  redirect(`${target}${target.includes('?') ? '&' : '?'}status=${status}`);
}

// ── Venues ─────────────────────────────────────────────────────────────────────────

export async function saveVenueAction(
  locale: AppLocale,
  venueId: string | null,
  _prev: FormState,
  formData: FormData,
) {
  return submit(formData, async (actor, meta) => {
    const input = formToObject(formData);
    const venue = venueId
      ? await updateVenue(actor, venueId, input, meta)
      : await createVenue(actor, input, meta);
    return `/${locale}/admin/venues/${venue.id}?status=saved`;
  });
}

export async function archiveVenueAction(locale: AppLocale, venueId: string, archived: boolean) {
  await act(
    `/${locale}/admin/venues/${venueId}`,
    (actor, meta) => setVenueArchived(actor, venueId, archived, meta),
    archived ? 'archived' : 'saved',
  );
}

// ── Clubs ──────────────────────────────────────────────────────────────────────────

export async function saveClubAction(
  locale: AppLocale,
  clubId: string | null,
  _prev: FormState,
  formData: FormData,
) {
  return submit(formData, async (actor, meta) => {
    const input = formToObject(formData);
    const club = clubId
      ? await updateClub(actor, clubId, input, meta)
      : await createClub(actor, input, meta);
    return `/${locale}/admin/clubs/${club.id}?status=saved`;
  });
}

export async function archiveClubAction(locale: AppLocale, clubId: string, archived: boolean) {
  await act(
    `/${locale}/admin/clubs/${clubId}`,
    (actor, meta) => setClubArchived(actor, clubId, archived, meta),
    archived ? 'archived' : 'saved',
  );
}

// ── Tournaments ────────────────────────────────────────────────────────────────────

export async function saveTournamentAction(
  locale: AppLocale,
  tournamentId: string | null,
  _prev: FormState,
  formData: FormData,
) {
  return submit(formData, async (actor, meta) => {
    const fields = formToObject(formData);
    // Price-list rows (bundlePrices.0 … .4) → one array, in order.
    const bundlePrices = Object.keys(fields)
      .filter((k) => k.startsWith('bundlePrices.'))
      .sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]))
      .map((k) => {
        const value = fields[k];
        delete fields[k];
        return value;
      });
    const input = withPrefixed({ ...fields, bundlePrices }, 'newVenue');
    const t = tournamentId
      ? await updateTournament(actor, tournamentId, input, meta)
      : await createTournament(actor, input, meta);
    return tournamentId
      ? `/${locale}/admin/tournaments/${t.id}/settings?status=saved`
      : `/${locale}/admin/tournaments/${t.id}?status=saved`;
  });
}

export async function tournamentStatusAction(
  locale: AppLocale,
  tournamentId: string,
  formData: FormData,
) {
  await act(`/${locale}/admin/tournaments/${tournamentId}`, (actor, meta) =>
    changeTournamentStatus(actor, tournamentId, { status: formData.get('status') }, meta),
  );
}

export async function publishTournamentAction(
  locale: AppLocale,
  tournamentId: string,
  published: boolean,
) {
  await act(`/${locale}/admin/tournaments/${tournamentId}`, (actor, meta) =>
    setTournamentPublished(actor, tournamentId, published, meta),
  );
}

export async function addOrganiserAction(
  locale: AppLocale,
  tournamentId: string,
  _prev: FormState,
  formData: FormData,
) {
  return submit(formData, async (actor, meta) => {
    const { linked } = await addOrganiser(actor, tournamentId, formToObject(formData), meta);
    return `/${locale}/admin/tournaments/${tournamentId}/settings?status=${linked ? 'organiserAdded' : 'organiserInvited'}#organisers`;
  });
}

export async function removeOrganiserAction(
  locale: AppLocale,
  tournamentId: string,
  formData: FormData,
) {
  const userId = formData.get('userId');
  const inviteId = formData.get('inviteId');
  await act(`/${locale}/admin/tournaments/${tournamentId}/settings`, (actor, meta) =>
    removeOrganiser(
      actor,
      tournamentId,
      {
        userId: typeof userId === 'string' && userId ? userId : undefined,
        inviteId: typeof inviteId === 'string' && inviteId ? inviteId : undefined,
      },
      meta,
    ),
  );
}

// ── Events ─────────────────────────────────────────────────────────────────────────

export async function saveEventAction(
  locale: AppLocale,
  tournamentId: string,
  eventId: string | null,
  _prev: FormState,
  formData: FormData,
) {
  return submit(formData, async (actor, meta) => {
    const input = formToObject(formData, { booleans: ['isOpen'] });
    if (eventId) await updateEvent(actor, tournamentId, eventId, input, meta);
    else await createEvent(actor, tournamentId, input, meta);
    return `/${locale}/admin/tournaments/${tournamentId}?status=saved#events`;
  });
}

export async function deleteEventAction(locale: AppLocale, tournamentId: string, eventId: string) {
  await act(
    `/${locale}/admin/tournaments/${tournamentId}`,
    (actor, meta) => deleteEvent(actor, tournamentId, eventId, meta),
    'deleted',
  );
}

// ── Players ────────────────────────────────────────────────────────────────────────

export async function savePlayerAction(
  locale: AppLocale,
  playerId: string | null,
  _prev: FormState,
  formData: FormData,
) {
  return submit(formData, async (actor, meta) => {
    const input = formToObject(formData, { arrays: ['preferredDisciplines'] });
    if (playerId) {
      await updatePlayer(actor, playerId, input, meta);
      return `/${locale}/admin/players/${playerId}?status=saved`;
    }
    // New player: back to the list, or straight to an empty form for the next one.
    const player = await createPlayer(actor, input, meta);
    const added = new URLSearchParams({
      added: [player.firstName, player.lastNamePrefix, player.lastName].filter(Boolean).join(' '),
      number: player.memberNumber,
    });
    return formData.get('next') === 'another'
      ? `/${locale}/admin/players/new?${added}`
      : `/${locale}/admin/players?${added}`;
  });
}

export async function mergePlayerAction(
  locale: AppLocale,
  sourceId: string,
  _prev: FormState,
  formData: FormData,
) {
  return submit(formData, async (actor, meta) => {
    const { targetId, targetMemberNumber } = await mergePlayers(
      actor,
      { sourceId, targetMemberNumber: formData.get('targetMemberNumber') },
      meta,
    );
    return `/${locale}/admin/players/${targetId}?status=merged&from=${encodeURIComponent(targetMemberNumber)}`;
  });
}

export type ImportState = FormState & { result?: ImportResult };

export async function importPlayersAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  try {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('csvInvalid');
    if (file.size > 2_000_000) throw new AppError('csvInvalid');
    const result = await importPlayersFile(
      await actorOrThrow(),
      new Uint8Array(await file.arrayBuffer()),
      await currentRequestMeta(),
    );
    revalidatePath('/', 'layout');
    return { ok: true, result };
  } catch (error) {
    return toFormState(error, new FormData());
  }
}

export type EntryImportState = FormState & { result?: EntryImportResult };

/** Admin: participants from an Excel/CSV file into one tournament (D53). */
export async function importEntriesAction(
  tournamentId: string,
  _prev: EntryImportState,
  formData: FormData,
): Promise<EntryImportState> {
  try {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > 2_000_000)
      throw new AppError('csvInvalid');
    const result = await importTournamentEntries(
      await actorOrThrow(),
      tournamentId,
      new Uint8Array(await file.arrayBuffer()),
      await currentRequestMeta(),
    );
    revalidatePath('/', 'layout');
    return { ok: true, result };
  } catch (error) {
    return toFormState(error, new FormData());
  }
}

/** Tournament logo (D67): upload or replace; the outcome shows via ?status= on the page. */
export async function uploadTournamentLogoAction(
  locale: AppLocale,
  tournamentId: string,
  formData: FormData,
) {
  await act(
    `/${locale}/admin/tournaments/${tournamentId}/settings`,
    async (actor, meta) => {
      const file = formData.get('logo');
      if (!(file instanceof File) || file.size === 0) throw new AppError('logoInvalid');
      if (file.size > LOGO_MAX_BYTES) throw new AppError('logoTooLarge');
      await setTournamentLogo(
        actor,
        tournamentId,
        { bytes: new Uint8Array(await file.arrayBuffer()) },
        meta,
      );
    },
    'logoSaved',
  );
}

export async function removeTournamentLogoAction(locale: AppLocale, tournamentId: string) {
  await act(
    `/${locale}/admin/tournaments/${tournamentId}/settings`,
    (actor, meta) => removeTournamentLogo(actor, tournamentId, meta),
    'logoRemoved',
  );
}

/** Admin: remove the selected players (D72); outcome as ?status=removed&count=… */
export async function removePlayersAction(formData: FormData) {
  const back = new URL(safeRedirectPath(formData.get('returnTo'), '/'), 'http://local');
  back.searchParams.delete('count');
  back.searchParams.delete('page');
  let status = 'removed';
  try {
    const count = await removePlayers(
      await actorOrThrow(),
      { ids: formData.getAll('ids'), password: formData.get('password') },
      await currentRequestMeta(),
    );
    back.searchParams.set('count', String(count));
  } catch (error) {
    status = error instanceof AppError ? error.code : 'unexpected';
    if (!(error instanceof AppError)) console.error('[admin action] remove players failed', error);
  }
  revalidatePath('/', 'layout');
  back.searchParams.set('status', status);
  redirect(`${back.pathname}${back.search}`);
}

/** Invites the selected players without an account (D76); back to the list with counts. */
export async function invitePlayersAction(locale: AppLocale, formData: FormData) {
  const back = new URL(safeRedirectPath(formData.get('returnTo'), '/'), 'http://local');
  for (const k of ['status', 'count', 'sent', 'skipped']) back.searchParams.delete(k);
  let status = 'invited';
  try {
    const { sent, skipped } = await invitePlayers(
      await actorOrThrow(),
      { ids: formData.getAll('ids') },
      locale,
      await currentRequestMeta(),
    );
    back.searchParams.set('sent', String(sent));
    back.searchParams.set('skipped', String(skipped));
  } catch (error) {
    status = error instanceof AppError ? error.code : 'unexpected';
    if (!(error instanceof AppError)) console.error('[admin action] invite players failed', error);
  }
  revalidatePath('/', 'layout');
  back.searchParams.set('status', status);
  redirect(`${back.pathname}${back.search}`);
}

export async function setSiteThemeAction(locale: AppLocale, formData: FormData) {
  await act(`/${locale}/admin/appearance`, (actor, meta) =>
    setSiteTheme(actor, { theme: formData.get('theme') }, meta),
  );
}
