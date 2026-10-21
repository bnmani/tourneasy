'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getActor } from '../auth/web';
import { isAppError } from '../lib/errors';
import { followPlayer, unfollowPlayer } from '../services/public-service';

/** Follow or unfollow a public player; outcome via ?status= on the player page. */
export async function setFollowAction(locale: AppLocale, memberNumber: string, follow: boolean) {
  const page = `/${locale}/players/${encodeURIComponent(memberNumber)}`;
  const actor = await getActor();
  if (!actor) redirect(`/${locale}/login?next=${encodeURIComponent(page)}`);
  let status = follow ? 'followed' : 'unfollowed';
  try {
    if (follow) await followPlayer(actor, memberNumber);
    else await unfollowPlayer(actor, memberNumber);
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[follow] failed', error);
  }
  revalidatePath(page);
  redirect(`${page}?status=${status}`);
}
