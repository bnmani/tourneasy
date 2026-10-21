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
  setSessionCookie,
} from '../auth/web';
import { safeRedirectPath } from '../lib/urls';
import {
  authenticate,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  signUp,
} from '../services/auth-service';
import {
  actorFromWebToken,
  createWebSession,
  revokeSessionById,
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
    const session = await createWebSession(userId, meta, rememberMe);
    await setSessionCookie(session.token, session.expiresAt, session.persistent);
    const actor = await actorFromWebToken(session.token);
    target = safeRedirectPath(
      formData.get('next'),
      actor ? homeFor(actor, locale) : `/${locale}/account`,
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  redirect(target);
}

export async function logoutAction(locale: AppLocale): Promise<void> {
  const actor = await getActor();
  if (actor) await revokeSessionById(actor.sessionId);
  await clearSessionCookie();
  redirect(`/${locale}`);
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
