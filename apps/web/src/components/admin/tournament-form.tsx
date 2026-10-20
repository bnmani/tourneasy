'use client';

import { NEW_VENUE, PROVINCES, TOURNAMENT_TYPES } from '@tourneasy/shared/schemas';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';
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
  const tv = useTranslations('Admin.venues');
  const tp = useTranslations('Provinces');
  const [state, action] = useActionState(
    saveTournamentAction.bind(null, locale, tournamentId),
    initialFormState,
  );
  // React resets the form after each submit: radio defaults follow the last submitted choice.
  const submittedType = state.values?.type as TournamentFormValues['type'] | undefined;
  const defaultType = submittedType ?? values.type ?? 'SELF';
  const [type, setType] = useState(defaultType);
  useEffect(() => setType(defaultType), [state, defaultType]);
  const submittedVenue = state.values?.venueId;
  const [venueId, setVenueId] = useState(
    (typeof submittedVenue === 'string' ? submittedVenue : values.venueId) ?? '',
  );
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
                    defaultChecked={defaultType === value}
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
        <div
          onChange={(e) => {
            const target = e.target;
            if (target instanceof HTMLSelectElement && target.name === 'venueId')
              setVenueId(target.value);
          }}
        >
          <SelectField
            name="venueId"
            label={t('venue')}
            state={state}
            defaultValue={values.venueId}
            placeholder={t('noVenue')}
            options={[
              ...venues.map((v) => ({ value: v.id, label: `${v.name}, ${v.city}` })),
              ...(isAdmin ? [{ value: NEW_VENUE, label: t('newVenue') }] : []),
            ]}
          />
        </div>
        {isAdmin && venueId === NEW_VENUE && (
          <fieldset className="space-y-4 rounded-md border bg-secondary/40 p-4">
            <legend className="px-1 text-sm font-medium">{t('newVenueTitle')}</legend>
            <p className="text-sm text-muted-foreground">{t('newVenueHint')}</p>
            <TextField
              name="newVenue.name"
              label={tv('name')}
              state={state}
              required
              maxLength={120}
            />
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <TextField
                name="newVenue.street"
                label={tv('street')}
                state={state}
                required
                autoComplete="address-line1"
              />
              <TextField
                name="newVenue.houseNumber"
                label={tv('houseNumber')}
                state={state}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <TextField
                name="newVenue.postcode"
                label={tv('postcode')}
                state={state}
                required
                autoComplete="postal-code"
              />
              <TextField
                name="newVenue.city"
                label={tv('city')}
                state={state}
                required
                autoComplete="address-level2"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="newVenue.province"
                label={tv('province')}
                state={state}
                required
                placeholder="—"
                options={PROVINCES.map((p) => ({ value: p, label: tp(p) }))}
              />
              <TextField
                name="newVenue.numberOfCourts"
                type="number"
                label={tv('numberOfCourts')}
                state={state}
                required
                inputMode="numeric"
              />
            </div>
          </fieldset>
        )}
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
