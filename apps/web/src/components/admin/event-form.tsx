'use client';

import {
  DRAW_TYPES,
  DISCIPLINES,
  KNOCKOUT_SIZE_OPTIONS,
  MATCHES_PER_ENTRY_OPTIONS,
} from '@tourneasy/shared/schemas';
import { pickLocalized, type AppLocale, type LocalizedText } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';
import {
  CheckboxField,
  FormError,
  FormSection,
  SelectField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { saveEventAction } from '@/server/actions/admin-actions';

export type EventFormValues = {
  discipline: string;
  ageCategoryId: string;
  levelClassId: string;
  nameNl: string;
  nameEn: string;
  fee: string;
  maxEntries: string;
  drawType: (typeof DRAW_TYPES)[number];
  groupSize: string;
  advancePerGroup: string;
  matchesPerEntry: string;
  knockoutSize: string;
  restMinutes: string;
  prizePlaces: '2' | '3';
  koScoringFrom: '' | 'KO' | 'QF' | 'SF' | 'F';
  koBestOf: string;
  koPointsToWin: string;
  koPointsCap: string;
  bestOf: string;
  pointsToWin: string;
  pointsCap: string;
  isOpen: boolean;
};

export function EventForm({
  locale,
  tournamentId,
  eventId,
  values,
  options,
}: {
  locale: AppLocale;
  tournamentId: string;
  eventId: string | null;
  values: EventFormValues;
  options: {
    ageCategories: { id: string; code: string; name: unknown }[];
    levels: { id: string; code: string }[];
  };
}) {
  const t = useTranslations('Admin.events');
  const ta = useTranslations('Admin');
  const td = useTranslations('Disciplines');
  const tdt = useTranslations('DrawTypes');
  const tdh = useTranslations('DrawTypeHelp');
  const [state, action] = useActionState(
    saveEventAction.bind(null, locale, tournamentId, eventId),
    initialFormState,
  );
  // React resets the form after each submit; radios fall back to their default, so the
  // default follows the last submitted choice and the visible extra fields follow it too.
  const submittedDrawType = state.values?.drawType as EventFormValues['drawType'] | undefined;
  const defaultDrawType = submittedDrawType ?? values.drawType;
  const [drawType, setDrawType] = useState(defaultDrawType);
  useEffect(() => setDrawType(defaultDrawType), [state, defaultDrawType]);
  const submittedKo = state.values?.koScoringFrom as EventFormValues['koScoringFrom'] | undefined;
  const [koFrom, setKoFrom] = useState(submittedKo ?? values.koScoringFrom ?? '');

  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError state={state} />
      <FormSection title={t('discipline')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="discipline"
            label={t('discipline')}
            state={state}
            required
            defaultValue={values.discipline}
            options={DISCIPLINES.map((d) => ({ value: d, label: td(d) }))}
          />
          <SelectField
            name="ageCategoryId"
            label={t('ageCategory')}
            state={state}
            defaultValue={values.ageCategoryId}
            placeholder={t('anyAge')}
            options={options.ageCategories.map((a) => ({
              value: a.id,
              label: pickLocalized(a.name as LocalizedText, locale) || a.code,
            }))}
          />
          <SelectField
            name="levelClassId"
            label={t('level')}
            hint={t('levelHint')}
            state={state}
            defaultValue={values.levelClassId}
            placeholder={t('anyLevel')}
            options={options.levels.map((l) => ({ value: l.id, label: l.code }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="nameNl"
            label={t('nameNl')}
            hint={t('nameHint')}
            state={state}
            defaultValue={values.nameNl}
            maxLength={80}
          />
          <TextField
            name="nameEn"
            label={t('nameEn')}
            state={state}
            defaultValue={values.nameEn}
            maxLength={80}
          />
        </div>
      </FormSection>

      <FormSection title={ta('tournaments.sectionCapacity')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="fee"
            label={t('fee')}
            state={state}
            required
            defaultValue={values.fee}
            inputMode="numeric"
          />
          <TextField
            name="maxEntries"
            type="number"
            min={2}
            max={512}
            label={t('maxEntries')}
            hint={t('maxEntriesHint')}
            state={state}
            defaultValue={values.maxEntries}
            inputMode="numeric"
          />
        </div>
        <CheckboxField
          name="isOpen"
          label={t('isOpen')}
          state={state}
          defaultChecked={values.isOpen}
        />
      </FormSection>

      <FormSection title={t('drawType')}>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('drawType')}</legend>
          {DRAW_TYPES.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-secondary"
            >
              <input
                type="radio"
                name="drawType"
                value={d}
                defaultChecked={defaultDrawType === d}
                onChange={() => setDrawType(d)}
                className="mt-1 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">{tdt(d)}</span>
                <span className="block text-sm text-muted-foreground">{tdh(d)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {drawType === 'GROUPS_KNOCKOUT' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="groupSize"
              type="number"
              min={3}
              max={8}
              label={t('groupSize')}
              state={state}
              required
              defaultValue={values.groupSize}
            />
            <TextField
              name="advancePerGroup"
              type="number"
              min={1}
              max={4}
              label={t('advancePerGroup')}
              state={state}
              required
              defaultValue={values.advancePerGroup}
            />
          </div>
        )}
        {drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="matchesPerEntry"
              label={t('matchesPerEntry')}
              hint={t('matchesPerEntryHint')}
              state={state}
              required
              defaultValue={values.matchesPerEntry}
              options={MATCHES_PER_ENTRY_OPTIONS.map((n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
            <SelectField
              name="knockoutSize"
              label={t('knockoutSize')}
              hint={t('knockoutSizeHint')}
              state={state}
              required
              defaultValue={values.knockoutSize}
              options={KNOCKOUT_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
        )}
      </FormSection>

      <FormSection title={t('scoring')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="bestOf"
            label={t('bestOf')}
            state={state}
            required
            defaultValue={values.bestOf}
            options={['1', '3', '5'].map((v) => ({ value: v, label: v }))}
          />
          <SelectField
            name="pointsToWin"
            label={t('pointsToWin')}
            state={state}
            required
            defaultValue={values.pointsToWin}
            options={['11', '15', '21'].map((v) => ({ value: v, label: v }))}
          />
          <TextField
            name="pointsCap"
            type="number"
            min={11}
            max={40}
            label={t('pointsCap')}
            state={state}
            required
            defaultValue={values.pointsCap}
          />
        </div>
        <div
          className="space-y-3 rounded-md border bg-secondary/30 p-4"
          onChange={(e) => {
            if (e.target instanceof HTMLSelectElement && e.target.name === 'koScoringFrom')
              setKoFrom(e.target.value as EventFormValues['koScoringFrom']);
          }}
        >
          <SelectField
            name="koScoringFrom"
            label={t('koScoringFrom')}
            hint={t('koScoringHint')}
            state={state}
            defaultValue={values.koScoringFrom ?? ''}
            placeholder={t('koScoringNone')}
            options={(drawType === 'GROUPS_KNOCKOUT' || drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT'
              ? (['KO', 'QF', 'SF', 'F'] as const)
              : drawType === 'ROUND_ROBIN' || drawType === 'SWISS'
                ? ([] as const)
                : (['QF', 'SF', 'F'] as const)
            ).map((v) => ({ value: v, label: t(`koFrom_${v}`) }))}
          />
          {koFrom && (
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                name="koBestOf"
                label={t('bestOf')}
                state={state}
                required
                defaultValue={values.koBestOf ?? '3'}
                options={['1', '3', '5'].map((v) => ({ value: v, label: v }))}
              />
              <SelectField
                name="koPointsToWin"
                label={t('pointsToWin')}
                state={state}
                required
                defaultValue={values.koPointsToWin ?? '21'}
                options={['11', '15', '21'].map((v) => ({ value: v, label: v }))}
              />
              <TextField
                name="koPointsCap"
                type="number"
                min={11}
                max={40}
                label={t('pointsCap')}
                state={state}
                required
                defaultValue={values.koPointsCap ?? '30'}
              />
            </div>
          )}
        </div>
        <TextField
          name="restMinutes"
          type="number"
          min={0}
          max={180}
          label={t('restMinutes')}
          hint={t('restMinutesHint')}
          state={state}
          defaultValue={values.restMinutes}
          inputMode="numeric"
        />
        <SelectField
          name="prizePlaces"
          label={t('prizePlaces')}
          hint={t('prizePlacesHint')}
          state={state}
          defaultValue={values.prizePlaces}
          options={(['3', '2'] as const).map((v) => ({ value: v, label: t(`prizePlaces_${v}`) }))}
        />
      </FormSection>

      <SubmitButton size="lg">{ta('save')}</SubmitButton>
    </form>
  );
}
