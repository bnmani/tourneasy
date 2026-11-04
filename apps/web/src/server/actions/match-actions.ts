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
  removeKnockoutStage,
  removeLastSwissRound,
  setCheckIn,
  startMatch,
  unstartMatch,
} from '../services/results-service';
import {
  moveMatch,
  proposeTournamentSchedule,
  publishSchedule,
  swapMatches,
  unscheduleMatch,
} from '../services/schedule-service';
import { payAtDesk, setPlayerCheckIn } from '../services/checkin-service';
import {
  markShareAsPaid,
  undoDeskPayment,
  undoDeskPaymentsForPlayer,
  undoWaiveShare,
  waiveShare,
} from '../services/payment-service';
import { moveEvent } from '../services/event-service';
import { cancelEntryAsOrganiser, restoreRegistration } from '../services/registration-service';

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
  // A fresh "at" each time: a redirect to the address already open (same status and
  // #anchor) would only scroll there, without reloading the data (D74).
  redirect(
    `${path}${path!.includes('?') ? '&' : '?'}status=${status}${params}&at=${Date.now().toString(36)}${hash ? `#${hash}` : ''}`,
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

// ── Instant desk buttons (D74): no redirect, the page refreshes its data itself ──────

export type QuickResult = { ok: true } | { ok: false; error: string };

async function quick(work: () => Promise<unknown>): Promise<QuickResult> {
  try {
    await work();
  } catch (error) {
    if (!isAppError(error)) console.error('[desk action] failed', error);
    return { ok: false, error: isAppError(error) ? error.code : 'unexpected' };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function quickCheckInAction(participantId: string, present: boolean) {
  return quick(async () =>
    setCheckIn(await actorOrThrow(), participantId, present, await currentRequestMeta()),
  );
}

export async function quickStartMatchAction(matchId: string) {
  return quick(async () => startMatch(await actorOrThrow(), matchId, await currentRequestMeta()));
}

export async function quickWalkoverAction(matchId: string, winner: 'A' | 'B') {
  return quick(async () =>
    recordWalkover(await actorOrThrow(), matchId, { winner }, await currentRequestMeta()),
  );
}

export async function playerCheckInAction(
  tournamentId: string,
  playerId: string,
  present: boolean,
) {
  return quick(async () =>
    setPlayerCheckIn(
      await actorOrThrow(),
      tournamentId,
      playerId,
      present,
      await currentRequestMeta(),
    ),
  );
}

/** Undoes the player's desk payments in this tournament, made by mistake (D96). */
export async function undoPayAtDeskAction(tournamentId: string, playerId: string) {
  return quick(async () =>
    undoDeskPaymentsForPlayer(
      await actorOrThrow(),
      tournamentId,
      playerId,
      await currentRequestMeta(),
    ),
  );
}

/** "On court" by mistake: back to waiting (D99). */
export async function quickUnstartMatchAction(matchId: string) {
  return quick(async () => unstartMatch(await actorOrThrow(), matchId, await currentRequestMeta()));
}

/** Removes a knockout stage or the latest Swiss round that has no results yet (D99). */
export async function removeStageAction(eventId: string, kind: 'knockout' | 'swiss') {
  return quick(async () =>
    (kind === 'knockout' ? removeKnockoutStage : removeLastSwissRound)(
      await actorOrThrow(),
      eventId,
      await currentRequestMeta(),
    ),
  );
}

/** Puts a cancelled entry back (D98): confirmed when there is room, else first in line. */
export async function restoreEntryAction(registrationId: string) {
  return quick(async () =>
    restoreRegistration(await actorOrThrow(), registrationId, await currentRequestMeta()),
  );
}

/** Undoes one share's desk payment from the participants list (D96). */
// ── Participants page: in place, so filters, sort and scroll stay (D113) ───────────

export async function quickMarkPaidAction(participantId: string, code?: string) {
  return quick(async () =>
    markShareAsPaid(
      await actorOrThrow(),
      { participantId, ...(code ? { code } : {}) },
      await currentRequestMeta(),
    ),
  );
}

export async function quickWaiveAction(participantId: string, undo: boolean) {
  return quick(async () => {
    const actor = await actorOrThrow();
    const meta = await currentRequestMeta();
    return undo
      ? undoWaiveShare(actor, { participantId }, meta)
      : waiveShare(actor, { participantId }, meta);
  });
}

/** Event order on the tournament overview, in place (D113). */
export async function quickMoveEventAction(
  tournamentId: string,
  eventId: string,
  direction: 'up' | 'down',
) {
  return quick(async () =>
    moveEvent(await actorOrThrow(), tournamentId, eventId, direction, await currentRequestMeta()),
  );
}

export async function quickCancelEntryAction(registrationId: string, reason?: string) {
  return quick(async () =>
    cancelEntryAsOrganiser(
      await actorOrThrow(),
      registrationId,
      { reason: reason || undefined },
      await currentRequestMeta(),
    ),
  );
}

export async function undoSharePaymentAction(participantId: string) {
  return quick(async () =>
    undoDeskPayment(await actorOrThrow(), { participantId }, await currentRequestMeta()),
  );
}

export async function payAtDeskAction(tournamentId: string, playerId: string) {
  return quick(async () =>
    payAtDesk(await actorOrThrow(), tournamentId, playerId, await currentRequestMeta()),
  );
}
