'use server';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError } from '../lib/errors';
import {
  previewEmailTemplate,
  resetEmailTemplate,
  saveEmailTemplate,
  sendEmailTemplateTest,
} from '../services/email-template-service';
import { formToObject, toFormState } from './form-utils';

export type EmailTemplateState = FormState & {
  preview?: { subject: string; html: string };
  notice?: { key: 'saved' | 'testSent'; to?: string };
};

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** One form, three buttons: show a preview, save, or send a test to yourself (D69). */
export async function emailTemplateAction(
  kind: string,
  lang: string,
  _prev: EmailTemplateState,
  formData: FormData,
): Promise<EmailTemplateState> {
  const intent = formData.get('intent');
  const draft = formToObject(formData);
  const values = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === 'string') as [string, string][],
  );
  try {
    const actor = await actorOrThrow();
    const meta = await currentRequestMeta();
    if (intent === 'save') {
      await saveEmailTemplate(actor, kind, lang, draft, meta);
      revalidatePath('/', 'layout');
    }
    const preview = await previewEmailTemplate(actor, kind, lang, draft);
    if (intent === 'test') {
      const to = await sendEmailTemplateTest(actor, kind, lang, draft, meta);
      return { values, preview, notice: { key: 'testSent', to } };
    }
    return {
      values,
      preview: { subject: preview.subject, html: preview.html },
      notice: intent === 'save' ? { key: 'saved' } : undefined,
    };
  } catch (error) {
    if (!isAppError(error)) console.error('[email templates] failed', error);
    return toFormState(error, formData);
  }
}

export async function resetEmailTemplateAction(locale: AppLocale, kind: string, lang: string) {
  let status = 'resetDone';
  try {
    await resetEmailTemplate(await actorOrThrow(), kind, lang, await currentRequestMeta());
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
  }
  revalidatePath('/', 'layout');
  redirect(`/${locale}/admin/email/templates/${kind}?lang=${lang}&status=${status}`);
}
