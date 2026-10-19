'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, FormSuccess, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Link } from '@/i18n/navigation';
import { forgotPasswordAction } from '@/server/actions/auth-actions';

export function ForgotForm() {
  const t = useTranslations('Auth.forgot');
  const [state, action] = useActionState(forgotPasswordAction, initialFormState);
  if (state.ok) {
    return (
      <div className="space-y-5">
        <FormSuccess>{t('sent')}</FormSuccess>
        <Link
          href="/login"
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      <TextField
        name="email"
        type="email"
        label={t('email')}
        state={state}
        required
        autoComplete="email"
        inputMode="email"
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SubmitButton>{t('submit')}</SubmitButton>
        <Link
          href="/login"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('backToLogin')}
        </Link>
      </div>
    </form>
  );
}
