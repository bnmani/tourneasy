'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { CheckboxField, FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { deleteAccountAction } from '@/server/actions/account-actions';

export function DeleteAccountForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations('Privacy');
  const [state, action] = useActionState(deleteAccountAction.bind(null, locale), initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <TextField
        name="password"
        type="password"
        label={t('deletePassword')}
        state={state}
        required
        autoComplete="current-password"
      />
      <CheckboxField name="confirm" label={t('deleteConfirm')} state={state} required />
      <SubmitButton className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
        {t('deleteButton')}
      </SubmitButton>
    </form>
  );
}
