'use server';

/** Passkeys as the second login step (D88): adding and removing them, and logging in. */
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import {
  currentRequestMeta,
  getActor,
  homeFor,
  readSessionToken,
  setSessionCookie,
} from '../auth/web';
import { AppError, type ErrorCode, isAppError } from '../lib/errors';
import { safeRedirectPath } from '../lib/urls';
import {
  addPasskey,
  passkeyLoginOptions,
  passkeyRegistrationOptions,
  removePasskey,
  verifyPasskeyLogin,
} from '../services/passkey-service';
import {
  actorFromWebToken,
  completeMfaSession,
  pendingMfaSession,
} from '../services/session-service';
import { toFormState } from './form-utils';

type Fail = { ok: false; error: ErrorCode };

function fail(error: unknown): Fail {
  if (!isAppError(error)) console.error('[passkey action] failed', error);
  return { ok: false, error: isAppError(error) ? error.code : 'unexpected' };
}

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

// ── Security page ──────────────────────────────────────────────────────────────────

export async function passkeyRegistrationOptionsAction(): Promise<
  { ok: true; options: PublicKeyCredentialCreationOptionsJSON } | Fail
> {
  try {
    return { ok: true, options: await passkeyRegistrationOptions(await actorOrThrow()) };
  } catch (error) {
    return fail(error);
  }
}

/** Saves the passkey; the recovery codes come back when it is the first second step. */
export async function addPasskeyAction(
  response: RegistrationResponseJSON,
): Promise<{ ok: true; codes: string[] | null } | Fail> {
  try {
    const { codes } = await addPasskey(await actorOrThrow(), response, await currentRequestMeta());
    revalidatePath('/', 'layout');
    return { ok: true, codes };
  } catch (error) {
    return fail(error);
  }
}

export async function removePasskeyAction(
  locale: AppLocale,
  passkeyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await removePasskey(
      await actorOrThrow(),
      passkeyId,
      { password: formData.get('password') },
      await currentRequestMeta(),
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`/${locale}/account/security?status=passkeyRemoved`);
}

// ── Login, after the password ───────────────────────────────────────────────────────

async function pending() {
  const token = await readSessionToken();
  const session = token ? await pendingMfaSession(token) : null;
  if (!token || !session) throw new AppError('unauthorized');
  return { token, session };
}

export async function passkeyLoginOptionsAction(): Promise<
  { ok: true; options: PublicKeyCredentialRequestOptionsJSON } | Fail
> {
  try {
    return { ok: true, options: await passkeyLoginOptions((await pending()).session) };
  } catch (error) {
    return fail(error);
  }
}

/** Finishes the login with the passkey; the client goes on to `target`. */
export async function passkeyLoginAction(
  locale: AppLocale,
  response: AuthenticationResponseJSON,
  remember: boolean,
  next: string,
): Promise<{ ok: true; target: string } | Fail> {
  try {
    const { token, session } = await pending();
    await verifyPasskeyLogin(session, response);
    const { expiresAt } = await completeMfaSession(session.sessionId, remember);
    await setSessionCookie(token, expiresAt, remember);
    const actor = await actorFromWebToken(token);
    return {
      ok: true,
      target: safeRedirectPath(next, actor ? homeFor(actor, locale) : `/${locale}/account`),
    };
  } catch (error) {
    return fail(error);
  }
}
