'use client';

import { PASSWORD_MIN_LENGTH } from '@tourneasy/shared/rules';
import { DISCIPLINES, GENDERS } from '@tourneasy/shared/schemas';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CheckboxField,
  CheckboxGroup,
  FormError,
  FormSection,
  SelectField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Link } from '@/i18n/navigation';
import { registerAction } from '@/server/actions/auth-actions';

const linkClass = 'font-medium text-primary underline underline-offset-4';

export function RegisterForm({ locale, next }: { locale: AppLocale; next?: string }) {
  const t = useTranslations('Auth.register');
  const tc = useTranslations('Common');
  const td = useTranslations('Disciplines');
  const tg = useTranslations('Genders');
  const [state, action] = useActionState(registerAction.bind(null, locale), initialFormState);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  const minorOpen = Boolean(
    state.fields?.parentalConsent || state.fields?.guardianName || state.values?.guardianName,
  );

  return (
    <form action={action} className="space-y-6" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormError state={state} />

      <FormSection title={t('sectionPersonal')}>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField
            name="firstName"
            label={t('firstName')}
            state={state}
            required
            autoComplete="given-name"
            maxLength={60}
          />
          <TextField
            name="lastNamePrefix"
            label={t('lastNamePrefix')}
            state={state}
            maxLength={20}
          />
        </div>
        <TextField
          name="lastName"
          label={t('lastName')}
          state={state}
          required
          autoComplete="family-name"
          maxLength={80}
        />
        <TextField
          name="email"
          type="email"
          label={t('email')}
          state={state}
          required
          autoComplete="email"
          inputMode="email"
        />
        <TextField
          name="phone"
          type="tel"
          label={t('phone')}
          hint={t('phoneHint')}
          state={state}
          required
          autoComplete="tel"
          inputMode="tel"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="dateOfBirth"
            type="date"
            label={t('dateOfBirth')}
            hint={t('dateOfBirthHint')}
            state={state}
            required
            autoComplete="bday"
          />
          <SelectField
            name="gender"
            label={t('gender')}
            state={state}
            required
            placeholder="—"
            options={GENDERS.map((g) => ({ value: g, label: tg(g) }))}
          />
        </div>
        <details open={minorOpen} className="rounded-md border border-dashed p-4">
          <summary className="cursor-pointer font-medium">{t('minorTitle')}</summary>
          <div className="mt-3 space-y-4">
            <p className="text-sm text-muted-foreground">{t('minorText')}</p>
            <TextField
              name="guardianName"
              label={t('guardianName')}
              state={state}
              maxLength={120}
            />
            <CheckboxField name="parentalConsent" label={t('parentalConsent')} state={state} />
          </div>
        </details>
      </FormSection>

      <FormSection title={t('sectionPlaying')}>
        <CheckboxGroup
          name="preferredDisciplines"
          legend={t('preferredDisciplines')}
          hint={t('preferredHint')}
          state={state}
          options={DISCIPLINES.map((d) => ({ value: d, label: td(d) }))}
        />
      </FormSection>

      <FormSection title={t('sectionAccount')}>
        <TextField
          name="password"
          type="password"
          label={t('password')}
          hint={t('passwordHint', { min: PASSWORD_MIN_LENGTH })}
          state={state}
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
        />
        <TextField
          name="passwordRepeat"
          type="password"
          label={t('passwordRepeat')}
          state={state}
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
        />
        <CheckboxField
          name="acceptTerms"
          state={state}
          required
          label={t.rich('acceptTerms', {
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
          label={t.rich('acceptPrivacy', {
            link: (chunks) => (
              <Link href="/privacy" target="_blank" className={linkClass}>
                {chunks}
              </Link>
            ),
          })}
        />
      </FormSection>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SubmitButton size="lg" pendingLabel={tc('saving')}>
          {t('submit')}
        </SubmitButton>
        <p className="text-sm text-muted-foreground">
          {t('haveAccount')}{' '}
          <Link href={loginHref} className={linkClass}>
            {t('login')}
          </Link>
        </p>
      </div>
    </form>
  );
}
