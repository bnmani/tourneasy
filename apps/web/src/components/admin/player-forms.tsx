'use client';

import { DISCIPLINES, GENDERS, PLAYER_CSV_COLUMNS } from '@tourneasy/shared/schemas';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CheckboxGroup,
  FormError,
  FormSection,
  FormSuccess,
  SelectField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import {
  importPlayersAction,
  mergePlayerAction,
  savePlayerAction,
  type ImportState,
} from '@/server/actions/admin-actions';

export type PlayerFormValues = {
  firstName: string;
  lastNamePrefix: string;
  lastName: string;
  contactEmail: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  clubId: string;
  federationId: string;
  levelSinglesId: string;
  levelDoublesId: string;
  levelMixedId: string;
  preferredDisciplines: string[];
};

type Options = {
  clubs: { id: string; name: string; city: string | null }[];
  levels: { id: string; code: string }[];
};

export function PlayerForm({
  locale,
  playerId,
  values,
  options,
  accountEmail,
}: {
  locale: AppLocale;
  playerId: string | null;
  values: Partial<PlayerFormValues>;
  options: Options;
  /** Players with an account: their login email (read-only here). */
  accountEmail?: string | null;
}) {
  const t = useTranslations('Admin.players');
  const ta = useTranslations('Admin');
  const tr = useTranslations('Auth.register');
  const tp = useTranslations('Profile');
  const td = useTranslations('Disciplines');
  const tg = useTranslations('Genders');
  const [state, action] = useActionState(
    savePlayerAction.bind(null, locale, playerId),
    initialFormState,
  );
  const levels = options.levels.map((l) => ({ value: l.id, label: l.code }));
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError state={state} />
      <FormSection title={tp('sectionPersonal')}>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField
            name="firstName"
            label={tr('firstName')}
            state={state}
            required
            defaultValue={values.firstName}
          />
          <TextField
            name="lastNamePrefix"
            label={tr('lastNamePrefix')}
            state={state}
            defaultValue={values.lastNamePrefix}
          />
        </div>
        <TextField
          name="lastName"
          label={tr('lastName')}
          state={state}
          required
          defaultValue={values.lastName}
        />
        {accountEmail ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('contactEmail')}</p>
            <p>{accountEmail}</p>
          </div>
        ) : (
          <TextField
            name="contactEmail"
            type="email"
            label={t('contactEmail')}
            hint={t('contactEmailHint')}
            state={state}
            defaultValue={values.contactEmail}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="phone"
            type="tel"
            label={tr('phone')}
            state={state}
            defaultValue={values.phone}
          />
          <TextField
            name="dateOfBirth"
            type="date"
            label={tr('dateOfBirth')}
            state={state}
            required
            defaultValue={values.dateOfBirth}
          />
          <SelectField
            name="gender"
            label={tr('gender')}
            state={state}
            required
            defaultValue={values.gender}
            placeholder="—"
            options={GENDERS.map((g) => ({ value: g, label: tg(g) }))}
          />
        </div>
        <TextField
          name="nationality"
          label={tp('nationality')}
          hint={tp('nationalityHint')}
          state={state}
          defaultValue={values.nationality}
          maxLength={2}
        />
      </FormSection>
      <FormSection title={tp('sectionPlaying')}>
        <CheckboxGroup
          name="preferredDisciplines"
          legend={tr('preferredDisciplines')}
          state={state}
          defaultValues={values.preferredDisciplines ?? []}
          options={DISCIPLINES.map((d) => ({ value: d, label: td(d) }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="clubId"
            label={tp('club')}
            state={state}
            defaultValue={values.clubId}
            placeholder={tp('noClub')}
            options={options.clubs.map((c) => ({
              value: c.id,
              label: c.city ? `${c.name} (${c.city})` : c.name,
            }))}
          />
          <TextField
            name="federationId"
            label={tp('federationId')}
            state={state}
            defaultValue={values.federationId}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="levelSinglesId"
            label={tp('levelSingles')}
            state={state}
            defaultValue={values.levelSinglesId}
            placeholder={tp('noLevel')}
            options={levels}
          />
          <SelectField
            name="levelDoublesId"
            label={tp('levelDoubles')}
            state={state}
            defaultValue={values.levelDoublesId}
            placeholder={tp('noLevel')}
            options={levels}
          />
          <SelectField
            name="levelMixedId"
            label={tp('levelMixed')}
            state={state}
            defaultValue={values.levelMixedId}
            placeholder={tp('noLevel')}
            options={levels}
          />
        </div>
      </FormSection>
      <SubmitButton size="lg">{ta('save')}</SubmitButton>
    </form>
  );
}

export function MergePlayerForm({ locale, sourceId }: { locale: AppLocale; sourceId: string }) {
  const t = useTranslations('Admin.players');
  const [state, action] = useActionState(
    mergePlayerAction.bind(null, locale, sourceId),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-3" noValidate>
      <p className="text-sm text-muted-foreground">{t('mergeHelp')}</p>
      <FormError state={state} />
      <TextField
        name="targetMemberNumber"
        label={t('mergeTarget')}
        state={state}
        required
        maxLength={8}
      />
      <SubmitButton variant="outline">{t('mergeSubmit')}</SubmitButton>
    </form>
  );
}

export function ImportPlayersForm() {
  const t = useTranslations('Admin.players');
  const te = useTranslations('Errors');
  const [state, action] = useActionState<ImportState, FormData>(
    importPlayersAction,
    initialFormState,
  );
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('importHelp', { columns: PLAYER_CSV_COLUMNS.join(', ') })}
        </p>
        <FormError state={state} />
        <div className="space-y-1.5">
          <label htmlFor="import-file" className="block text-sm font-medium">
            {t('file')}
          </label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-2"
          />
        </div>
        <SubmitButton>{t('importSubmit')}</SubmitButton>
      </form>
      {state.result && (
        <div className="space-y-3">
          <FormSuccess>
            {t('importResult', {
              created: state.result.created,
              updated: state.result.updated,
              skipped: state.result.skipped,
            })}
          </FormSuccess>
          {state.result.errors.length > 0 && (
            <section>
              <h2 className="font-semibold">{t('importErrors')}</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                {state.result.errors.slice(0, 200).map((e, i) => (
                  <li key={i}>
                    {t('importLine', {
                      line: e.line,
                      message: `${e.field}: ${te.has(e.error as 'invalid') ? te(e.error as 'invalid', { min: 10, minutes: 15 }) : e.error}`,
                    })}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
