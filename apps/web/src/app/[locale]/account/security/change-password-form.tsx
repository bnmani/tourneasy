'use client';

import { PASSWORD_MIN_LENGTH } from '@tourneasy/shared/rules';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, FormSuccess, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { changePasswordAction } from '@/server/actions/account-actions';

export function ChangePasswordForm() {
  const t = useTranslations('Security');
  const tr = useTranslations('Auth.register');
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.ok && <FormSuccess>{t('changed')}</FormSuccess>}
      <FormError state={state} />
      <TextField
        name="currentPassword"
        type="password"
        label={t('currentPassword')}
        state={state}
        required
        autoComplete="current-password"
      />
      <TextField
        name="newPassword"
        type="password"
        label={t('newPassword')}
        hint={tr('passwordHint', { min: PASSWORD_MIN_LENGTH })}
        state={state}
        required
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
      />
      <TextField
        name="newPasswordRepeat"
        type="password"
        label={tr('passwordRepeat')}
        state={state}
        required
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
      />
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}
