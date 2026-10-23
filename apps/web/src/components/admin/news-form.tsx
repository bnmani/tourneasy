'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, SubmitButton, TextAreaField, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { createNewsAction } from '@/server/actions/news-actions';

/** New news item for a tournament: Dutch required, English optional (D62). */
export function NewsForm({ locale, tournamentId }: { locale: AppLocale; tournamentId: string }) {
  const t = useTranslations('Admin.news');
  const [state, action] = useActionState(
    createNewsAction.bind(null, locale, tournamentId),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="titleNl" label={t('titleNl')} state={state} required maxLength={140} />
        <TextField name="titleEn" label={t('titleEn')} state={state} maxLength={140} />
      </div>
      <TextAreaField
        name="bodyNl"
        label={t('bodyNl')}
        state={state}
        required
        rows={5}
        maxLength={5000}
      />
      <TextAreaField name="bodyEn" label={t('bodyEn')} state={state} rows={4} maxLength={5000} />
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="publish" defaultChecked className="size-4 accent-primary" />
          {t('publishNow')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="email" className="size-4 accent-primary" />
          {t('emailNow')}
        </label>
      </div>
      <SubmitButton>{t('save')}</SubmitButton>
    </form>
  );
}
