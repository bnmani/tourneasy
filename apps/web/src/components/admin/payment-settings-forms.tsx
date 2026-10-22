'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { savePaymentSettingsAction, unlockSettingsAction } from '@/server/actions/payment-actions';

/** Password prompt that unlocks the Stripe settings (D54). */
export function UnlockSettingsForm({
  locale,
  page = 'payments',
}: {
  locale: AppLocale;
  page?: 'payments' | 'email';
}) {
  const t = useTranslations('Admin.paymentSettings');
  const [state, action] = useActionState(
    unlockSettingsAction.bind(null, locale, page),
    initialFormState,
  );
  return (
    <form action={action} className="max-w-sm space-y-4" noValidate>
      <FormError state={state} />
      <TextField
        name="password"
        type="password"
        label={t('password')}
        hint={t('passwordHint')}
        state={state}
        required
        autoComplete="current-password"
      />
      <SubmitButton>{t('unlock')}</SubmitButton>
    </form>
  );
}

/** Key fields; empty fields keep what is stored, secrets are never shown again. */
export function PaymentSettingsForm({
  locale,
  publishableKey,
  secretKeyLast4,
  webhookSet,
}: {
  locale: AppLocale;
  publishableKey: string | null;
  secretKeyLast4: string | null;
  webhookSet: boolean;
}) {
  const t = useTranslations('Admin.paymentSettings');
  const [state, action] = useActionState(
    savePaymentSettingsAction.bind(null, locale),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-4" noValidate autoComplete="off">
      <FormError state={state} />
      <TextField
        name="publishableKey"
        label={t('publishableKey')}
        hint={publishableKey ? t('currentValue', { value: publishableKey }) : t('publishableHint')}
        state={state}
        autoComplete="off"
      />
      <TextField
        name="secretKey"
        type="password"
        label={t('secretKey')}
        hint={secretKeyLast4 ? t('storedSecret', { last4: secretKeyLast4 }) : t('secretHint')}
        state={state}
        autoComplete="off"
      />
      <TextField
        name="webhookSecret"
        type="password"
        label={t('webhookSecret')}
        hint={webhookSet ? t('storedWebhook') : t('webhookHint')}
        state={state}
        autoComplete="off"
      />
      <SubmitButton>{t('save')}</SubmitButton>
    </form>
  );
}
