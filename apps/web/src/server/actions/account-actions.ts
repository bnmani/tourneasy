'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { clearSessionCookie, currentRequestMeta, getActor } from '../auth/web';
import { AppError } from '../lib/errors';
import { safeRedirectPath } from '../lib/urls';
import { changePassword } from '../services/auth-service';
import { deleteMyAccount } from '../services/gdpr-service';
import { updateMyProfile } from '../services/profile-service';
import { grantRole, removeUsers, revokeRole } from '../services/role-service';
import { revokeAllSessions, revokeSession } from '../services/session-service';
import { formToObject, toFormState } from './form-utils';
import { OPTIONAL_TYPES, saveMyPreferences } from '../services/notification-service';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const actor = await actorOrThrow();
    const input = formToObject(formData, {
      booleans: ['publicProfile'],
      arrays: ['preferredDisciplines'],
    });
    await updateMyProfile(actor, input, await currentRequestMeta());
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return toFormState(error, formData);
  }
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await changePassword(await actorOrThrow(), formToObject(formData), await currentRequestMeta());
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return toFormState(error, formData);
  }
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const actor = await actorOrThrow();
  const sessionId = String(formData.get('sessionId') ?? '');
  if (sessionId) await revokeSession(actor, sessionId).catch(() => undefined);
  revalidatePath('/', 'layout');
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const actor = await actorOrThrow();
  await revokeAllSessions(actor.userId, actor.sessionId);
  revalidatePath('/', 'layout');
}

export async function deleteAccountAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await deleteMyAccount(await actorOrThrow(), formToObject(formData, { booleans: ['confirm'] }));
  } catch (error) {
    return toFormState(error, formData);
  }
  await clearSessionCookie();
  redirect(`/${locale}?deleted=1`);
}

/** Role buttons on the admin page; reports the outcome via ?status= on the same page. */
export async function changeRoleAction(formData: FormData): Promise<void> {
  // Same page and search, plus the outcome (?status=granted|revoked|<error code>).
  const back = new URL(safeRedirectPath(formData.get('returnTo'), '/'), 'http://local');
  let status: string;
  try {
    const actor = await actorOrThrow();
    const input = { userId: formData.get('userId'), role: formData.get('role') };
    const meta = await currentRequestMeta();
    if (formData.get('op') === 'grant') {
      await grantRole(actor, input, meta);
      status = 'granted';
    } else {
      await revokeRole(actor, input, meta);
      status = 'revoked';
    }
  } catch (error) {
    status = error instanceof AppError ? error.code : 'unexpected';
    if (!(error instanceof AppError)) console.error('[action] role change failed', error);
  }
  revalidatePath('/', 'layout');
  back.searchParams.set('status', status);
  redirect(`${back.pathname}${back.search}`);
}

/** Admin: remove the selected accounts (D72); outcome as ?status=removed&count=… */
/**
 * Owners: removes the selected accounts (D72, D80). A wrong password or other refusal comes
 * back to the popup, so the selection stays; success goes back to the list with the count.
 */
export async function removeUsersAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const back = new URL(safeRedirectPath(formData.get('returnTo'), '/'), 'http://local');
  back.searchParams.delete('count');
  try {
    const count = await removeUsers(
      await actorOrThrow(),
      { userIds: formData.getAll('ids'), password: formData.get('password') },
      await currentRequestMeta(),
    );
    back.searchParams.set('count', String(count));
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  back.searchParams.set('status', 'removed');
  redirect(`${back.pathname}${back.search}`);
}

/** Email preferences (D62): one checkbox per optional kind. */
export async function saveNotificationPreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const actor = await actorOrThrow();
    await saveMyPreferences(
      actor,
      Object.fromEntries(OPTIONAL_TYPES.map((type) => [type, formData.get(type) === 'on'])),
    );
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return toFormState(error, formData);
  }
}
