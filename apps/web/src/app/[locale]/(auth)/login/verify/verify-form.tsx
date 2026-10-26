'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { verifyLoginAction } from '@/server/actions/auth-actions';

export function VerifyForm({
  locale,
  next,
  remember,
}: {
  locale: AppLocale;
  next: string;
  remember: boolean;
}) {
  const t = useTranslations('Auth.mfa');
  const [state, action] = useActionState(verifyLoginAction.bind(null, locale), initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      <input type="hidden" name="next" value={next} />
      {remember && <input type="hidden" name="remember" value="1" />}
      <TextField
        name="code"
        label={t('code')}
        hint={t('codeHint')}
        state={state}
        required
        autoComplete="one-time-code"
        inputMode="text"
        maxLength={20}
      />
      <SubmitButton size="lg">{t('submit')}</SubmitButton>
    </form>
  );
}
