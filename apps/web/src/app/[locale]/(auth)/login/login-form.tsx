'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { CheckboxField, FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Link } from '@/i18n/navigation';
import { loginAction } from '@/server/actions/auth-actions';

export function LoginForm({ locale, next }: { locale: AppLocale; next?: string }) {
  const t = useTranslations('Auth.login');
  const [state, action] = useActionState(loginAction.bind(null, locale), initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <TextField
        name="identifier"
        label={t('identifier')}
        hint={t('identifierHint')}
        state={state}
        required
        autoComplete="username"
        maxLength={254}
      />
      <TextField
        name="password"
        type="password"
        label={t('password')}
        state={state}
        required
        autoComplete="current-password"
      />
      <CheckboxField name="rememberMe" label={t('rememberMe')} state={state} defaultChecked />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SubmitButton>{t('submit')}</SubmitButton>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('forgot')}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('register')}
        </Link>
      </p>
    </form>
  );
}
