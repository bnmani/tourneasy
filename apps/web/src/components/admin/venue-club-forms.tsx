'use client';

import { PROVINCES } from '@tourneasy/shared/schemas';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  FormError,
  FormSection,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { saveClubAction, saveVenueAction } from '@/server/actions/admin-actions';

export type VenueFormValues = Record<
  | 'name'
  | 'street'
  | 'houseNumber'
  | 'postcode'
  | 'city'
  | 'province'
  | 'country'
  | 'numberOfCourts'
  | 'latitude'
  | 'longitude'
  | 'phone'
  | 'website'
  | 'facilities'
  | 'parkingInfo'
  | 'publicTransportInfo',
  string
>;

export function VenueForm({
  locale,
  venueId,
  values,
}: {
  locale: AppLocale;
  venueId: string | null;
  values: Partial<VenueFormValues>;
}) {
  const t = useTranslations('Admin.venues');
  const ta = useTranslations('Admin');
  const tp = useTranslations('Provinces');
  const [state, action] = useActionState(
    saveVenueAction.bind(null, locale, venueId),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError state={state} />
      <FormSection title={t('name')}>
        <TextField
          name="name"
          label={t('name')}
          state={state}
          required
          defaultValue={values.name}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField
            name="street"
            label={t('street')}
            state={state}
            required
            defaultValue={values.street}
            autoComplete="address-line1"
          />
          <TextField
            name="houseNumber"
            label={t('houseNumber')}
            state={state}
            required
            defaultValue={values.houseNumber}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <TextField
            name="postcode"
            label={t('postcode')}
            state={state}
            required
            defaultValue={values.postcode}
            autoComplete="postal-code"
          />
          <TextField
            name="city"
            label={t('city')}
            state={state}
            required
            defaultValue={values.city}
            autoComplete="address-level2"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="province"
            label={t('province')}
            state={state}
            required
            defaultValue={values.province}
            placeholder="—"
            options={PROVINCES.map((p) => ({ value: p, label: tp(p) }))}
          />
          <TextField
            name="country"
            label={t('country')}
            state={state}
            required
            defaultValue={values.country ?? 'NL'}
            maxLength={2}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="numberOfCourts"
            type="number"
            label={t('numberOfCourts')}
            state={state}
            required
            defaultValue={values.numberOfCourts}
          />
          <TextField
            name="latitude"
            label={t('latitude')}
            hint={t('coordinatesHint')}
            state={state}
            defaultValue={values.latitude}
            inputMode="numeric"
          />
          <TextField
            name="longitude"
            label={t('longitude')}
            state={state}
            defaultValue={values.longitude}
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="phone"
            type="tel"
            label={t('phone')}
            state={state}
            defaultValue={values.phone}
          />
          <TextField
            name="website"
            label={t('website')}
            state={state}
            defaultValue={values.website}
          />
        </div>
        <TextAreaField
          name="facilities"
          label={t('facilities')}
          state={state}
          defaultValue={values.facilities}
          rows={2}
        />
        <TextAreaField
          name="parkingInfo"
          label={t('parkingInfo')}
          state={state}
          defaultValue={values.parkingInfo}
          rows={2}
        />
        <TextAreaField
          name="publicTransportInfo"
          label={t('publicTransportInfo')}
          state={state}
          defaultValue={values.publicTransportInfo}
          rows={2}
        />
      </FormSection>
      <SubmitButton size="lg">{ta('save')}</SubmitButton>
    </form>
  );
}

export type ClubFormValues = Record<
  'name' | 'shortName' | 'federationCode' | 'city' | 'province' | 'website' | 'email' | 'venueId',
  string
>;

export function ClubForm({
  locale,
  clubId,
  values,
  venues,
}: {
  locale: AppLocale;
  clubId: string | null;
  values: Partial<ClubFormValues>;
  venues: { id: string; name: string; city: string }[];
}) {
  const t = useTranslations('Admin.clubs');
  const ta = useTranslations('Admin');
  const tp = useTranslations('Provinces');
  const [state, action] = useActionState(
    saveClubAction.bind(null, locale, clubId),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError state={state} />
      <FormSection title={t('name')}>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <TextField
            name="name"
            label={t('name')}
            state={state}
            required
            defaultValue={values.name}
          />
          <TextField
            name="shortName"
            label={t('shortName')}
            state={state}
            defaultValue={values.shortName}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="federationCode"
            label={t('federationCode')}
            state={state}
            defaultValue={values.federationCode}
          />
          <TextField name="city" label={t('city')} state={state} defaultValue={values.city} />
          <SelectField
            name="province"
            label={t('province')}
            state={state}
            defaultValue={values.province}
            placeholder="—"
            options={PROVINCES.map((p) => ({ value: p, label: tp(p) }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="website"
            label={t('website')}
            state={state}
            defaultValue={values.website}
          />
          <TextField
            name="email"
            type="email"
            label={t('email')}
            state={state}
            defaultValue={values.email}
          />
        </div>
        <SelectField
          name="venueId"
          label={t('venue')}
          state={state}
          defaultValue={values.venueId}
          placeholder="—"
          options={venues.map((v) => ({ value: v.id, label: `${v.name}, ${v.city}` }))}
        />
      </FormSection>
      <SubmitButton size="lg">{ta('save')}</SubmitButton>
    </form>
  );
}
