'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { CheckboxField, FormError, SubmitButton, TextAreaField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { submitFeedbackAction } from '@/server/actions/feedback-actions';

/** A player's feedback on a finished tournament: a rating, a comment and one optional consent box. */
export function FeedbackForm({
  locale,
  tournamentId,
  slug,
}: {
  locale: AppLocale;
  tournamentId: string;
  slug: string;
}) {
  const t = useTranslations('Feedback');
  const [state, action] = useActionState(
    submitFeedbackAction.bind(null, locale, tournamentId, slug),
    initialFormState,
  );
  const rating = state.values?.rating;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('rating')}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('stars')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex size-11 cursor-pointer items-center justify-center rounded-md border border-input text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                required
                defaultChecked={rating === String(n)}
                className="sr-only"
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      <TextAreaField
        name="comment"
        label={t('comment')}
        state={state}
        required
        rows={4}
        maxLength={500}
        hint={t('commentHint')}
      />
      <CheckboxField name="shareConsent" label={t('consent')} state={state} required />
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}
