'use server';

/**
 * Server actions for the auth pages. They only translate between forms and the service
 * layer (parse FormData → call service → set cookie / redirect); no business logic here.
 */
import type { AppLocale } from '@tourneasy/shared/i18n';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import {
  clearSessionCookie,
  currentRequestMeta,
  getActor,
  homeFor,
  readSessionToken,
  setSessionCookie,
} from '../auth/web';
import { safeRedirectPath } from '../lib/urls';
import {
  authenticate,
  isEmailVerified,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  signUp,
} from '../services/auth-service';
import { checkMfaCode, hasMfa } from '../services/mfa-service';
import { acceptPlayerInvite } from '../services/player-invite-service';
import {
  actorFromWebToken,
  completeMfaSession,
  createWebSession,
  pendingMfaSession,
} from '../services/session-service';
import { formToObject, toFormState } from './form-utils';

export async function registerAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const meta = await currentRequestMeta();
  let result: { userId: string; memberNumber: string };
  try {
    const input = formToObject(formData, {
      booleans: ['acceptTerms', 'acceptPrivacy', 'parentalConsent'],
      arrays: ['preferredDisciplines'],
    });
    result = await signUp({ ...input, locale }, meta);
    const session = await createWebSession(result.userId, meta, true);
    await setSessionCookie(session.token, session.expiresAt, session.persistent);
  } catch (error) {
    return toFormState(error, formData);
  }
  const next = safeRedirectPath(formData.get('next'), '');
  redirect(next || `/${locale}/account?welcome=1`);
}

export async function loginAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const meta = await currentRequestMeta();
  let target: string;
  try {
    const input = formToObject(formData, { booleans: ['rememberMe'] });
    const { userId, rememberMe } = await authenticate(input, meta);
    // Two-step login (D78): the password alone signs nobody in; the code page finishes it.
    if (await hasMfa(userId)) {
      const pending = await createWebSession(userId, meta, false, { mfaPending: true });
      await setSessionCookie(pending.token, pending.expiresAt, false);
      const query = new URLSearchParams({
        ...(rememberMe ? { remember: '1' } : {}),
        next: safeRedirectPath(formData.get('next'), ''),
      });
      target = `/${locale}/login/verify?${query}`;
    } else {
      const session = await createWebSession(userId, meta, rememberMe);
      await setSessionCookie(session.token, session.expiresAt, session.persistent);
      const actor = await actorFromWebToken(session.token);
      target = safeRedirectPath(
        formData.get('next'),
        actor ? homeFor(actor, locale) : `/${locale}/account`,
      );
    }
  } catch (error) {
    return toFormState(error, formData);
  }
  redirect(target);
}

/** The two-step code after the password: finishes the login, or says the code is wrong. */
export async function verifyLoginAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const meta = await currentRequestMeta();
  const token = await readSessionToken();
  const pending = token ? await pendingMfaSession(token) : null;
  if (!token || !pending) redirect(`/${locale}/login`);
  let target: string;
  try {
    const remember = formData.get('remember') === '1';
    const { recoveryUsed } = await checkMfaCode(
      pending.userId,
      String(formData.get('code') ?? ''),
      meta,
    );
    const { expiresAt } = await completeMfaSession(pending.sessionId, remember);
    await setSessionCookie(token, expiresAt, remember);
    const actor = await actorFromWebToken(token);
    target = recoveryUsed
      ? `/${locale}/account/security?status=recoveryUsed`
      : safeRedirectPath(
          formData.get('next'),
          actor ? homeFor(actor, locale) : `/${locale}/account`,
        );
  } catch (error) {
    return toFormState(error, formData);
  }
  redirect(target);
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await requestPasswordReset(formToObject(formData), await currentRequestMeta());
    return { ok: true };
  } catch (error) {
    return toFormState(error, formData);
  }
}

export async function resetPasswordAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await resetPassword(formToObject(formData), await currentRequestMeta());
  } catch (error) {
    return toFormState(error, formData);
  }
  await clearSessionCookie();
  redirect(`/${locale}/login?reset=1`);
}

/** Activating an invited player's account (D76): signed in and on to the dashboard. */
export async function activateAccountAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const meta = await currentRequestMeta();
  try {
    const input = formToObject(formData, {
      booleans: ['acceptTerms', 'acceptPrivacy', 'parentalConsent'],
    });
    const { userId } = await acceptPlayerInvite(input, locale, meta);
    const session = await createWebSession(userId, meta, true);
    await setSessionCookie(session.token, session.expiresAt, session.persistent);
  } catch (error) {
    return toFormState(error, formData);
  }
  redirect(`/${locale}/account?welcome=activated`);
}

/** Whether the signed-in account's email is confirmed now (polled by the "confirm" notice). */
export async function emailVerifiedNowAction(): Promise<boolean> {
  const actor = await getActor();
  return actor ? isEmailVerified(actor.userId) : false;
}

export async function resendVerificationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  if (!actor) return { error: 'unauthorized' };
  try {
    await resendVerificationEmail(actor);
    return { ok: true };
  } catch (error) {
    return toFormState(error, formData);
  }
}
