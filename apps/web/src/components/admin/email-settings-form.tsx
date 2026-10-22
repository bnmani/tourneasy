'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, SelectField, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { saveEmailSettingsAction } from '@/server/actions/email-settings-actions';

export type EmailSettingsValues = {
  host: string;
  port: string;
  security: 'tls' | 'starttls' | 'none';
  user: string;
  from: string;
  passwordSet: boolean;
};

/** SMTP fields (D58); the password is never shown, an empty field keeps it. */
export function EmailSettingsForm({
  locale,
  values,
}: {
  locale: AppLocale;
  values: EmailSettingsValues;
}) {
  const t = useTranslations('Admin.emailSettings');
  const [state, action] = useActionState(
    saveEmailSettingsAction.bind(null, locale),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-4" noValidate autoComplete="off">
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem_12rem]">
        <TextField
          name="host"
          label={t('host')}
          hint={t('hostHint')}
          state={state}
          required
          defaultValue={values.host}
        />
        <TextField
          name="port"
          type="number"
          min={1}
          max={65535}
          label={t('port')}
          state={state}
          required
          defaultValue={values.port}
          inputMode="numeric"
        />
        <SelectField
          name="security"
          label={t('security')}
          state={state}
          required
          defaultValue={values.security}
          options={(['tls', 'starttls', 'none'] as const).map((s) => ({
            value: s,
            label: t(`security_${s}`),
          }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="user"
          label={t('user')}
          state={state}
          defaultValue={values.user}
          autoComplete="off"
        />
        <TextField
          name="password"
          type="password"
          label={t('password')}
          hint={values.passwordSet ? t('passwordStored') : t('passwordHint')}
          state={state}
          autoComplete="new-password"
        />
      </div>
      <TextField
        name="from"
        label={t('from')}
        hint={t('fromHint')}
        state={state}
        required
        defaultValue={values.from}
      />
      <SubmitButton>{t('save')}</SubmitButton>
    </form>
  );
}
