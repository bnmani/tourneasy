'use client';

import { DISCIPLINES, GENDERS } from '@tourneasy/shared/schemas';
import { locales } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CheckboxField,
  CheckboxGroup,
  FormError,
  FormSection,
  FormSuccess,
  SelectField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { updateProfileAction } from '@/server/actions/account-actions';
import type { MyAccount } from '@/server/services/profile-service';

type Options = {
  clubs: { id: string; name: string; city: string | null }[];
  levels: { id: string; code: string }[];
};

export function ProfileForm({ account, options }: { account: MyAccount; options: Options }) {
  const t = useTranslations('Profile');
  const tr = useTranslations('Auth.register');
  const tc = useTranslations('Common');
  const td = useTranslations('Disciplines');
  const tg = useTranslations('Genders');
  const tl = useTranslations('LanguageSwitcher');
  const [state, action] = useActionState(updateProfileAction, initialFormState);
  const p = account.profile!;
  const levelOptions = options.levels.map((l) => ({ value: l.id, label: l.code }));

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.ok && <FormSuccess>{t('saved')}</FormSuccess>}
      <FormError state={state} />

      <FormSection title={t('sectionPersonal')}>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField
            name="firstName"
            label={tr('firstName')}
            state={state}
            required
            defaultValue={p.firstName}
            autoComplete="given-name"
          />
          <TextField
            name="lastNamePrefix"
            label={tr('lastNamePrefix')}
            state={state}
            defaultValue={p.lastNamePrefix ?? ''}
          />
        </div>
        <TextField
          name="lastName"
          label={tr('lastName')}
          state={state}
          required
          defaultValue={p.lastName}
          autoComplete="family-name"
        />
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('email')}</p>
          <p>{account.email}</p>
          <p className="text-sm text-muted-foreground">{t('emailHint')}</p>
        </div>
        <TextField
          name="phone"
          type="tel"
          label={tr('phone')}
          state={state}
          required
          defaultValue={p.phone ?? ''}
          autoComplete="tel"
          inputMode="tel"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="dateOfBirth"
            type="date"
            label={tr('dateOfBirth')}
            state={state}
            required
            defaultValue={p.dateOfBirth}
          />
          <SelectField
            name="gender"
            label={tr('gender')}
            state={state}
            required
            defaultValue={p.gender}
            options={GENDERS.map((g) => ({ value: g, label: tg(g) }))}
          />
        </div>
        <TextField
          name="nationality"
          label={t('nationality')}
          hint={t('nationalityHint')}
          state={state}
          defaultValue={p.nationality ?? ''}
          maxLength={2}
        />
      </FormSection>

      <FormSection title={t('sectionPlaying')}>
        <CheckboxGroup
          name="preferredDisciplines"
          legend={tr('preferredDisciplines')}
          state={state}
          defaultValues={p.preferredDisciplines}
          options={DISCIPLINES.map((d) => ({ value: d, label: td(d) }))}
        />
        <SelectField
          name="clubId"
          label={t('club')}
          state={state}
          defaultValue={p.club?.id ?? ''}
          placeholder={t('noClub')}
          options={options.clubs.map((c) => ({
            value: c.id,
            label: c.city ? `${c.name} (${c.city})` : c.name,
          }))}
        />
        <TextField
          name="federationId"
          label={t('federationId')}
          state={state}
          defaultValue={p.federationId ?? ''}
          maxLength={20}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="levelSinglesId"
            label={t('levelSingles')}
            state={state}
            defaultValue={p.levelSingles?.id ?? ''}
            placeholder={t('noLevel')}
            options={levelOptions}
          />
          <SelectField
            name="levelDoublesId"
            label={t('levelDoubles')}
            state={state}
            defaultValue={p.levelDoubles?.id ?? ''}
            placeholder={t('noLevel')}
            options={levelOptions}
          />
          <SelectField
            name="levelMixedId"
            label={t('levelMixed')}
            state={state}
            defaultValue={p.levelMixed?.id ?? ''}
            placeholder={t('noLevel')}
            options={levelOptions}
          />
        </div>
      </FormSection>

      <FormSection title={t('sectionEmergency')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="emergencyName"
            label={t('emergencyName')}
            state={state}
            defaultValue={p.emergencyName ?? ''}
          />
          <TextField
            name="emergencyPhone"
            type="tel"
            label={t('emergencyPhone')}
            state={state}
            defaultValue={p.emergencyPhone ?? ''}
            inputMode="tel"
          />
        </div>
      </FormSection>

      <FormSection title={t('sectionPreferences')}>
        <SelectField
          name="locale"
          label={t('language')}
          state={state}
          required
          defaultValue={account.locale}
          options={locales.map((l) => ({ value: l, label: tl(l) }))}
        />
        {p.isMinor ? (
          <p className="text-sm text-muted-foreground">{t('publicProfileMinor')}</p>
        ) : (
          <CheckboxField
            name="publicProfile"
            label={t('publicProfile')}
            state={state}
            defaultChecked={p.publicProfile}
          />
        )}
      </FormSection>

      <SubmitButton size="lg" pendingLabel={tc('saving')}>
        {tc('save')}
      </SubmitButton>
    </form>
  );
}
