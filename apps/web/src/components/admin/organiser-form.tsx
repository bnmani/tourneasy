'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { addOrganiserAction } from '@/server/actions/admin-actions';

export function OrganiserForm({
  locale,
  tournamentId,
}: {
  locale: AppLocale;
  tournamentId: string;
}) {
  const t = useTranslations('Admin.tournaments');
  const [state, action] = useActionState(
    addOrganiserAction.bind(null, locale, tournamentId),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormError state={state} />
      <TextField
        name="email"
        type="email"
        label={t('organiserEmail')}
        hint={t('organiserEmailHint')}
        state={state}
        required
      />
      <SubmitButton variant="outline">{t('addOrganiser')}</SubmitButton>
    </form>
  );
}
