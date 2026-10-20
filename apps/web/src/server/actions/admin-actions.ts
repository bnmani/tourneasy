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
import {
  createPlayer,
  importPlayersCsv,
  mergePlayers,
  updatePlayer,
  type ImportResult,
} from '../services/player-service';
import type { Actor } from '../services/session-service';
import {
  addOrganiser,
  changeTournamentStatus,
  createTournament,
  removeOrganiser,
  setTournamentPublished,
  updateTournament,
} from '../services/tournament-service';
import { createVenue, setVenueArchived, updateVenue } from '../services/venue-service';
import { formToObject, toFormState } from './form-utils';

async function actorOrThrow(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** Runs `work` and redirects to the path it returns; errors become form state. */
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
    const input = formToObject(formData);
    const t = tournamentId
      ? await updateTournament(actor, tournamentId, input, meta)
      : await createTournament(actor, input, meta);
    return `/${locale}/admin/tournaments/${t.id}?status=saved`;
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
    return `/${locale}/admin/tournaments/${tournamentId}?status=${linked ? 'organiserAdded' : 'organiserInvited'}#organisers`;
  });
}

export async function removeOrganiserAction(
  locale: AppLocale,
  tournamentId: string,
  formData: FormData,
) {
  const userId = formData.get('userId');
  const inviteId = formData.get('inviteId');
  await act(`/${locale}/admin/tournaments/${tournamentId}`, (actor, meta) =>
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
    const input = formToObject(formData, { booleans: ['allowOtherGender', 'isOpen'] });
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
    const player = playerId
      ? await updatePlayer(actor, playerId, input, meta)
      : await createPlayer(actor, input, meta);
    return `/${locale}/admin/players/${player.id}?status=saved`;
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
    const result = await importPlayersCsv(
      await actorOrThrow(),
      await file.text(),
      await currentRequestMeta(),
    );
    revalidatePath('/', 'layout');
    return { ok: true, result };
  } catch (error) {
    return toFormState(error, new FormData());
  }
}
