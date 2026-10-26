'use server';

/** Two-step login on the security page, and the admin reset (D78). */
import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError } from '../lib/errors';
import { safeRedirectPath } from '../lib/urls';
import {
  confirmMfaSetup,
  disableMfa,
  regenerateRecoveryCodes,
  resetUserMfa,
} from '../services/mfa-service';
import { toFormState } from './form-utils';

export type CodesState = FormState & { codes?: string[] };

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** Turns it on; the recovery codes come back to show once. */
export async function confirmMfaAction(_prev: CodesState, formData: FormData): Promise<CodesState> {
  try {
    const codes = await confirmMfaSetup(
      await actorOrThrow(),
      { code: formData.get('code') },
      await currentRequestMeta(),
    );
    return { ok: true, codes };
  } catch (error) {
    return toFormState(error, formData);
  }
}

export async function newRecoveryCodesAction(
  _prev: CodesState,
  formData: FormData,
): Promise<CodesState> {
  try {
    const codes = await regenerateRecoveryCodes(
      await actorOrThrow(),
      { code: formData.get('code') },
      await currentRequestMeta(),
    );
    return { ok: true, codes };
  } catch (error) {
    return toFormState(error, formData);
  }
}

export async function disableMfaAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await disableMfa(
      await actorOrThrow(),
      { password: formData.get('password'), code: formData.get('code') },
      await currentRequestMeta(),
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`/${locale}/account/security?status=mfaDisabled`);
}

/** Users page: someone lost their phone and recovery codes. */
export async function resetUserMfaAction(formData: FormData) {
  const back = new URL(safeRedirectPath(formData.get('returnTo'), '/'), 'http://local');
  let status = 'mfaReset';
  try {
    await resetUserMfa(
      await actorOrThrow(),
      String(formData.get('userId') ?? ''),
      await currentRequestMeta(),
    );
  } catch (error) {
    status = error instanceof AppError ? error.code : 'unexpected';
    if (!(error instanceof AppError)) console.error('[mfa action] reset failed', error);
  }
  back.searchParams.set('status', status);
  redirect(`${back.pathname}${back.search}`);
}
