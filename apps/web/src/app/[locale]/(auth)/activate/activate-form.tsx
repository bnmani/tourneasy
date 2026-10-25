'use client';

import { PASSWORD_MIN_LENGTH } from '@tourneasy/shared/rules';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { CheckboxField, FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Link } from '@/i18n/navigation';
import { activateAccountAction } from '@/server/actions/auth-actions';

const linkClass = 'font-medium text-primary underline underline-offset-4';

export function ActivateForm({
  locale,
  token,
  minor,
}: {
  locale: AppLocale;
  token: string;
  minor: boolean;
}) {
  const t = useTranslations('Auth');
  const [state, action] = useActionState(
    activateAccountAction.bind(null, locale),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      {(state.error === 'tokenInvalid' || state.error === 'emailTaken') && (
        <Link href="/login" className={linkClass}>
          {t('activate.login')}
        </Link>
      )}
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        type="password"
        label={t('register.password')}
        hint={t('register.passwordHint', { min: PASSWORD_MIN_LENGTH })}
        state={state}
        required
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
      />
      <TextField
        name="passwordRepeat"
        type="password"
        label={t('register.passwordRepeat')}
        state={state}
        required
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
      />
      {minor && (
        <section
          aria-labelledby="minor-title"
          className="space-y-4 rounded-md border border-dashed p-4"
        >
          <h2 id="minor-title" className="font-medium">
            {t('register.minorTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('register.minorText')}</p>
          <TextField
            name="guardianName"
            label={t('register.guardianName')}
            state={state}
            required
            maxLength={120}
          />
          <CheckboxField
            name="parentalConsent"
            label={t('register.parentalConsent')}
            state={state}
            required
          />
        </section>
      )}
      <CheckboxField
        name="acceptTerms"
        state={state}
        required
        label={t.rich('register.acceptTerms', {
          link: (chunks) => (
            <Link href="/terms" target="_blank" className={linkClass}>
              {chunks}
            </Link>
          ),
        })}
      />
      <CheckboxField
        name="acceptPrivacy"
        state={state}
        required
        label={t.rich('register.acceptPrivacy', {
          link: (chunks) => (
            <Link href="/privacy" target="_blank" className={linkClass}>
              {chunks}
            </Link>
          ),
        })}
      />
      <SubmitButton size="lg">{t('activate.submit')}</SubmitButton>
    </form>
  );
}
