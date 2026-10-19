'use client';

import { PASSWORD_MIN_LENGTH } from '@tourneasy/shared/rules';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Link } from '@/i18n/navigation';
import { resetPasswordAction } from '@/server/actions/auth-actions';

export function ResetForm({ locale, token }: { locale: AppLocale; token: string }) {
  const t = useTranslations('Auth');
  const [state, action] = useActionState(resetPasswordAction.bind(null, locale), initialFormState);
  const tokenFailed = state.error === 'tokenInvalid' || state.fields?.token;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={tokenFailed && !state.error ? { error: 'tokenInvalid' } : state} />
      {tokenFailed && (
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          {t('verify.resend')}
        </Link>
      )}
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        type="password"
        label={t('reset.newPassword')}
        hint={t('register.passwordHint', { min: PASSWORD_MIN_LENGTH })}
        state={state}
        required
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
      />
      <SubmitButton>{t('reset.submit')}</SubmitButton>
    </form>
  );
}
