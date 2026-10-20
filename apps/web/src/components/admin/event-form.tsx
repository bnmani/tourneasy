'use client';

import { DRAW_TYPES, DISCIPLINES } from '@tourneasy/shared/schemas';
import { pickLocalized, type AppLocale, type LocalizedText } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
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
  allowOtherGender: boolean;
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
  const [drawType, setDrawType] = useState(values.drawType);

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
        <CheckboxField
          name="allowOtherGender"
          label={t('allowOtherGender')}
          state={state}
          defaultChecked={values.allowOtherGender}
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
                checked={drawType === d}
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
              label={t('groupSize')}
              state={state}
              required
              defaultValue={values.groupSize}
            />
            <TextField
              name="advancePerGroup"
              type="number"
              label={t('advancePerGroup')}
              state={state}
              required
              defaultValue={values.advancePerGroup}
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
            label={t('pointsCap')}
            state={state}
            required
            defaultValue={values.pointsCap}
          />
        </div>
      </FormSection>

      <SubmitButton size="lg">{ta('save')}</SubmitButton>
    </form>
  );
}
