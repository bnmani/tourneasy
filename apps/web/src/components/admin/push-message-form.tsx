'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CheckboxField,
  FormError,
  FormSuccess,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/forms/fields';
import type { FormState } from '@/components/forms/form-state';

export type MessageFormState = FormState & {
  sent?: { count: number; test: boolean; pushConfigured: boolean };
};

type Props = {
  action: (prev: MessageFormState, formData: FormData) => Promise<MessageFormState>;
  /** How many people "send" reaches right now. */
  count: number;
  defaults?: { title?: string; body?: string };
  /** All app users: a test to yourself first, and a tick to confirm before sending to all. */
  withTest?: boolean;
};

/** A title and short message sent to the app as a push and kept in the notification list. */
export function PushMessageForm({ action, count, defaults, withTest }: Props) {
  const t = useTranslations('PushMessage');
  const [state, formAction] = useActionState(action, {} as MessageFormState);
  const sent = state.ok ? state.sent : undefined;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError state={state} />
      {sent && (
        <FormSuccess>
          {sent.test ? t('all.testSent') : t('sent', { count: sent.count })}
          {!sent.pushConfigured && <> {t('pushNotSetUp')}</>}
        </FormSuccess>
      )}
      <TextField
        name="title"
        label={t('title')}
        state={state}
        required
        maxLength={80}
        defaultValue={defaults?.title}
      />
      <TextAreaField
        name="body"
        label={t('body')}
        state={state}
        required
        rows={3}
        maxLength={300}
        defaultValue={defaults?.body}
      />
      {withTest ? (
        <>
          <CheckboxField name="confirmed" label={t('all.confirm', { count })} state={state} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton name="mode" value="test" variant="outline">
              {t('all.test')}
            </SubmitButton>
            <SubmitButton name="mode" value="all">
              {t('all.sendAll')}
            </SubmitButton>
          </div>
        </>
      ) : (
        <SubmitButton>{t('send')}</SubmitButton>
      )}
    </form>
  );
}
