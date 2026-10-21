'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import {
  createKnockoutFromGroups,
  nextSwissRound,
  recordResult,
  recordRetirement,
  recordWalkover,
  setCheckIn,
  startMatch,
} from '../services/results-service';
import {
  moveMatch,
  proposeTournamentSchedule,
  publishSchedule,
  swapMatches,
  unscheduleMatch,
} from '../services/schedule-service';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

async function act(target: string, okStatus: string, work: () => Promise<unknown>) {
  let status = okStatus;
  let params = '';
  try {
    const out = await work();
    if (out && typeof out === 'object' && 'unscheduled' in out)
      params = `&unscheduled=${(out as { unscheduled: number }).unscheduled}`;
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (isAppError(error) && typeof error.details.fields === 'object') {
      const f = error.details.fields as Record<string, string>;
      status = f.games ?? status;
      if (f.game) params = `&game=${f.game}`;
    }
    if (!isAppError(error)) console.error('[match action] failed', error);
  }
  revalidatePath('/', 'layout');
  const [path, hash] = target.split('#');
  redirect(
    `${path}${path!.includes('?') ? '&' : '?'}status=${status}${params}${hash ? `#${hash}` : ''}`,
  );
}

const schedulePage = (locale: AppLocale, id: string) =>
  `/${locale}/admin/tournaments/${id}/schedule`;
const deskPage = (locale: AppLocale, id: string, view?: string) =>
  `/${locale}/admin/tournaments/${id}/matches${view ? `?view=${view}` : ''}`;

export async function proposeScheduleAction(
  locale: AppLocale,
  tournamentId: string,
  mode: 'all' | 'remaining',
) {
  await act(schedulePage(locale, tournamentId), 'scheduleProposed', async () =>
    proposeTournamentSchedule(
      await actorOrThrow(),
      tournamentId,
      { mode },
      await currentRequestMeta(),
    ),
  );
}

export async function publishScheduleAction(
  locale: AppLocale,
  tournamentId: string,
  publish: boolean,
) {
  await act(
    schedulePage(locale, tournamentId),
    publish ? 'schedulePublished' : 'scheduleUnpublished',
    async () =>
      publishSchedule(await actorOrThrow(), tournamentId, publish, await currentRequestMeta()),
  );
}

export async function moveMatchAction(
  locale: AppLocale,
  tournamentId: string,
  matchId: string,
  formData: FormData,
) {
  await act(`${schedulePage(locale, tournamentId)}#m-${matchId}`, 'saved', async () =>
    moveMatch(
      await actorOrThrow(),
      matchId,
      { courtId: formData.get('courtId'), startsAt: formData.get('startsAt') },
      await currentRequestMeta(),
    ),
  );
}

export async function swapMatchAction(
  locale: AppLocale,
  tournamentId: string,
  matchId: string,
  formData: FormData,
) {
  await act(`${schedulePage(locale, tournamentId)}#m-${matchId}`, 'saved', async () =>
    swapMatches(
      await actorOrThrow(),
      { a: matchId, b: formData.get('other') },
      await currentRequestMeta(),
    ),
  );
}

export async function unscheduleMatchAction(
  locale: AppLocale,
  tournamentId: string,
  matchId: string,
) {
  await act(schedulePage(locale, tournamentId), 'saved', async () =>
    unscheduleMatch(await actorOrThrow(), matchId, await currentRequestMeta()),
  );
}

/** Score form: g1a, g1b, g2a, … (empty games are left out). */
function gamesFrom(formData: FormData) {
  const games: [number, number][] = [];
  for (let i = 1; i <= 5; i++) {
    const a = formData.get(`g${i}a`);
    const b = formData.get(`g${i}b`);
    if (typeof a === 'string' && typeof b === 'string' && a.trim() !== '' && b.trim() !== '')
      games.push([Number(a), Number(b)]);
  }
  return games;
}

export async function resultAction(
  locale: AppLocale,
  tournamentId: string,
  matchId: string,
  view: string,
  formData: FormData,
) {
  // The typed games go back in the URL, so a refused score doesn't have to be typed again.
  const typed = gamesFrom(formData)
    .map(([a, b]) => `${a}-${b}`)
    .join('.');
  const target = `${deskPage(locale, tournamentId, view)}&entered=${matchId}~${typed}#m-${matchId}`;
  await act(target, 'resultSaved', async () =>
    recordResult(
      await actorOrThrow(),
      matchId,
      { games: gamesFrom(formData), version: formData.get('version') ?? undefined },
      await currentRequestMeta(),
    ),
  );
}

export async function walkoverAction(
  locale: AppLocale,
  tournamentId: string,
  matchId: string,
  view: string,
  formData: FormData,
) {
  await act(`${deskPage(locale, tournamentId, view)}#m-${matchId}`, 'resultSaved', async () =>
    recordWalkover(
      await actorOrThrow(),
      matchId,
      { winner: formData.get('winner') },
      await currentRequestMeta(),
    ),
  );
}

export async function retireAction(
  locale: AppLocale,
  tournamentId: string,
  matchId: string,
  view: string,
  formData: FormData,
) {
  await act(`${deskPage(locale, tournamentId, view)}#m-${matchId}`, 'resultSaved', async () =>
    recordRetirement(
      await actorOrThrow(),
      matchId,
      { winner: formData.get('winner'), games: gamesFrom(formData) },
      await currentRequestMeta(),
    ),
  );
}

export async function startMatchAction(
  locale: AppLocale,
  tournamentId: string,
  matchId: string,
  view: string,
) {
  void view; // the match moves to "On court", so show that list
  await act(`${deskPage(locale, tournamentId, 'now')}#m-${matchId}`, 'saved', async () =>
    startMatch(await actorOrThrow(), matchId, await currentRequestMeta()),
  );
}

export async function checkInAction(
  locale: AppLocale,
  tournamentId: string,
  participantId: string,
  present: boolean,
  view: string,
  anchor: string,
) {
  await act(`${deskPage(locale, tournamentId, view)}#${anchor}`, 'saved', async () =>
    setCheckIn(await actorOrThrow(), participantId, present, await currentRequestMeta()),
  );
}

export async function knockoutStageAction(
  locale: AppLocale,
  tournamentId: string,
  eventId: string,
) {
  await act(deskPage(locale, tournamentId), 'stageCreated', async () =>
    createKnockoutFromGroups(await actorOrThrow(), eventId, await currentRequestMeta()),
  );
}

export async function swissRoundAction(locale: AppLocale, tournamentId: string, eventId: string) {
  await act(deskPage(locale, tournamentId), 'stageCreated', async () =>
    nextSwissRound(await actorOrThrow(), eventId, await currentRequestMeta()),
  );
}
