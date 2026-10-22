'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import { lockSettings } from '../services/payment-settings-service';
import {
  clearEmailSettings,
  saveEmailSettings,
  sendTestEmail,
} from '../services/email-settings-service';
import { toFormState } from './form-utils';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

const PAGE = (locale: AppLocale) => `/${locale}/admin/email`;

export async function saveEmailSettingsAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await saveEmailSettings(
      await actorOrThrow(),
      {
        host: formData.get('host'),
        port: formData.get('port'),
        security: formData.get('security'),
        user: formData.get('user'),
        password: formData.get('password'),
        from: formData.get('from'),
      },
      await currentRequestMeta(),
    );
  } catch (error) {
    // Refill the form, but never with the password.
    const echo = new FormData();
    for (const key of ['host', 'port', 'security', 'user', 'from']) {
      const v = formData.get(key);
      if (typeof v === 'string') echo.set(key, v);
    }
    return toFormState(error, echo);
  }
  revalidatePath('/', 'layout');
  redirect(`${PAGE(locale)}?status=saved`);
}

/** Test email to the admin's own address; the result shows on the page. */
export async function testEmailAction(locale: AppLocale) {
  let query = 'status=testSent';
  try {
    const to = await sendTestEmail(await actorOrThrow(), await currentRequestMeta());
    query += `&to=${encodeURIComponent(to)}`;
  } catch (error) {
    if (!isAppError(error)) console.error('[email settings] test failed', error);
    const reason =
      isAppError(error) && typeof error.details.reason === 'string' ? error.details.reason : '';
    query = `status=${isAppError(error) ? error.code : 'unexpected'}&reason=${encodeURIComponent(reason)}`;
  }
  redirect(`${PAGE(locale)}?${query}`);
}

export async function lockEmailSettingsAction(locale: AppLocale) {
  await lockSettings(await actorOrThrow());
  redirect(`${PAGE(locale)}?status=locked`);
}

export async function clearEmailSettingsAction(locale: AppLocale) {
  let status = 'deleted';
  try {
    await clearEmailSettings(await actorOrThrow(), await currentRequestMeta());
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
  }
  revalidatePath('/', 'layout');
  redirect(`${PAGE(locale)}?status=${status}`);
}
