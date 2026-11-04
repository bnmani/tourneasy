'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  FormError,
  FormSuccess,
  SelectField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { createDiscountCodeAction } from '@/server/actions/payment-actions';

/** Owner: a new entry discount code (D111). */
export function DiscountCodeForm({
  locale,
  tournaments,
}: {
  locale: AppLocale;
  tournaments: { id: string; name: string }[];
}) {
  const t = useTranslations('Admin.codes');
  const [state, action] = useActionState(
    createDiscountCodeAction.bind(null, locale),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      {state.ok && <FormSuccess>{t('created')}</FormSuccess>}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="code"
          label={t('code')}
          hint={t('codeHint')}
          state={state}
          required
          maxLength={30}
        />
        <TextField
          name="percent"
          label={t('percent')}
          hint={t('percentHint')}
          state={state}
          required
          inputMode="numeric"
          defaultValue="100"
        />
        <SelectField
          name="tournamentId"
          label={t('tournament')}
          state={state}
          placeholder={t('allTournaments')}
          options={tournaments.map((x) => ({ value: x.id, label: x.name }))}
        />
        <TextField
          name="maxUses"
          label={t('maxUses')}
          hint={t('maxUsesHint')}
          state={state}
          inputMode="numeric"
        />
        <TextField name="validUntil" type="date" label={t('validUntil')} state={state} />
        <TextField
          name="note"
          label={t('note')}
          hint={t('noteHint')}
          state={state}
          maxLength={120}
        />
      </div>
      <SubmitButton>{t('create')}</SubmitButton>
    </form>
  );
}
