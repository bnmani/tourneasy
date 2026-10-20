'use client';

import { TOURNAMENT_TYPES } from '@tourneasy/shared/schemas';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  FormError,
  FormSection,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { saveTournamentAction } from '@/server/actions/admin-actions';

export type TournamentFormValues = {
  name: string;
  type: 'SELF' | 'THIRD_PARTY';
  venueId: string;
  startsOn: string;
  endsOn: string;
  dayStartTime: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  withdrawalDeadline: string;
  maxParticipants: string;
  maxEventsPerPlayer: string;
  courtsAvailable: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  descriptionNl: string;
  descriptionEn: string;
};

export function TournamentForm({
  locale,
  tournamentId,
  values,
  venues,
  isAdmin,
}: {
  locale: AppLocale;
  tournamentId: string | null;
  values: Partial<TournamentFormValues>;
  venues: { id: string; name: string; city: string; numberOfCourts: number }[];
  isAdmin: boolean;
}) {
  const t = useTranslations('Admin.tournaments');
  const ta = useTranslations('Admin');
  const tt = useTranslations('TournamentTypes');
  const [state, action] = useActionState(
    saveTournamentAction.bind(null, locale, tournamentId),
    initialFormState,
  );
  const [type, setType] = useState(values.type ?? 'SELF');
  const tz = t('timezoneHint');

  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError state={state} />

      <FormSection title={t('sectionBasics')}>
        <TextField
          name="name"
          label={t('name')}
          state={state}
          required
          defaultValue={values.name}
          maxLength={120}
        />
        {isAdmin ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('type')}</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {TOURNAMENT_TYPES.map((value) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary"
                >
                  <input
                    type="radio"
                    name="type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="size-4 accent-primary"
                  />
                  {tt(value)}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <input type="hidden" name="type" value={type} />
        )}
        {isAdmin && type === 'THIRD_PARTY' && !tournamentId && (
          <TextField
            name="organiserEmail"
            type="email"
            label={t('organiserEmail')}
            hint={t('organiserEmailHint')}
            state={state}
            required
            defaultValue={values.contactEmail}
          />
        )}
        <SelectField
          name="venueId"
          label={t('venue')}
          state={state}
          defaultValue={values.venueId}
          placeholder={t('noVenue')}
          options={venues.map((v) => ({ value: v.id, label: `${v.name}, ${v.city}` }))}
        />
      </FormSection>

      <FormSection title={t('sectionDates')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="startsOn"
            type="date"
            label={t('startsOn')}
            state={state}
            required
            defaultValue={values.startsOn}
          />
          <TextField
            name="endsOn"
            type="date"
            label={t('endsOn')}
            state={state}
            required
            defaultValue={values.endsOn}
          />
          <TextField
            name="dayStartTime"
            type="time"
            label={t('dayStartTime')}
            hint={tz}
            state={state}
            defaultValue={values.dayStartTime}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="registrationOpensAt"
            type="datetime-local"
            label={t('registrationOpensAt')}
            hint={tz}
            state={state}
            required
            defaultValue={values.registrationOpensAt}
          />
          <TextField
            name="registrationClosesAt"
            type="datetime-local"
            label={t('registrationClosesAt')}
            hint={tz}
            state={state}
            required
            defaultValue={values.registrationClosesAt}
          />
          <TextField
            name="withdrawalDeadline"
            type="datetime-local"
            label={t('withdrawalDeadline')}
            hint={tz}
            state={state}
            required
            defaultValue={values.withdrawalDeadline}
          />
        </div>
      </FormSection>

      <FormSection title={t('sectionCapacity')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="maxParticipants"
            type="number"
            label={t('maxParticipants')}
            state={state}
            defaultValue={values.maxParticipants}
            inputMode="numeric"
          />
          <SelectField
            name="maxEventsPerPlayer"
            label={t('maxEventsPerPlayer')}
            state={state}
            required
            defaultValue={values.maxEventsPerPlayer ?? '3'}
            options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))}
          />
          <TextField
            name="courtsAvailable"
            type="number"
            label={t('courtsAvailable')}
            hint={t('courtsAvailableHint')}
            state={state}
            defaultValue={values.courtsAvailable}
            inputMode="numeric"
          />
        </div>
      </FormSection>

      <FormSection title={t('sectionContact')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="contactName"
            label={t('contactName')}
            state={state}
            defaultValue={values.contactName}
          />
          <TextField
            name="contactEmail"
            type="email"
            label={t('contactEmail')}
            state={state}
            defaultValue={values.contactEmail}
          />
          <TextField
            name="contactPhone"
            type="tel"
            label={t('contactPhone')}
            state={state}
            defaultValue={values.contactPhone}
          />
        </div>
      </FormSection>

      <FormSection title={t('sectionDescription')}>
        <TextAreaField
          name="descriptionNl"
          label={t('descriptionNl')}
          state={state}
          defaultValue={values.descriptionNl}
          rows={5}
          maxLength={5000}
        />
        <TextAreaField
          name="descriptionEn"
          label={t('descriptionEn')}
          state={state}
          defaultValue={values.descriptionEn}
          rows={5}
          maxLength={5000}
        />
      </FormSection>

      <SubmitButton size="lg">{ta('save')}</SubmitButton>
    </form>
  );
}
