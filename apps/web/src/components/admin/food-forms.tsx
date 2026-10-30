'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CheckboxField,
  FormError,
  SubmitButton,
  TextAreaField,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { saveFoodItemAction, saveFoodSettingsAction } from '@/server/actions/pricing-food-actions';

/** Organiser: ordering on or off, the deadline and where to collect (D87). */
export function FoodSettingsForm({
  locale,
  tournamentId,
  values,
}: {
  locale: AppLocale;
  tournamentId: string;
  values: { on: boolean; cutoffAt: string; pickupInfo: string };
}) {
  const t = useTranslations('Food.admin');
  const [state, action] = useActionState(
    saveFoodSettingsAction.bind(null, locale, tournamentId),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <CheckboxField name="on" label={t('on')} state={state} defaultChecked={values.on} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="cutoffAt"
          type="datetime-local"
          label={t('cutoffAt')}
          hint={t('cutoffHint')}
          state={state}
          defaultValue={values.cutoffAt}
        />
        <TextField
          name="pickupInfo"
          label={t('pickupInfo')}
          hint={t('pickupHint')}
          state={state}
          defaultValue={values.pickupInfo}
          maxLength={200}
        />
      </div>
      <SubmitButton>{t('saveSettings')}</SubmitButton>
    </form>
  );
}

export type FoodItemValues = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  allergens: string[];
  noAllergens: boolean;
  maxQuantity: number | null;
  active: boolean;
};

/** Organiser: add a menu item, or change one. Allergen information is required. */
export function FoodItemForm({
  locale,
  tournamentId,
  allergens,
  item,
}: {
  locale: AppLocale;
  tournamentId: string;
  allergens: readonly string[];
  item?: FoodItemValues;
}) {
  const t = useTranslations('Food.admin');
  const ta = useTranslations('Food.allergens');
  const te = useTranslations('Errors');
  const [state, action] = useActionState(
    saveFoodItemAction.bind(null, locale, tournamentId, item?.id ?? null),
    initialFormState,
  );
  const chosen = (key: string) => {
    const v = state.values?.allergens;
    if (v !== undefined) return Array.isArray(v) ? v.includes(key) : v === key;
    return item?.allergens.includes(key) ?? false;
  };
  const allergenError = state.fields?.allergens;
  const prefix = item ? `item-${item.id}` : 'item-new';
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <TextField
          name="name"
          label={t('name')}
          state={state}
          defaultValue={item?.name}
          maxLength={80}
          required
        />
        <TextField
          name="price"
          label={t('price')}
          state={state}
          inputMode="numeric"
          defaultValue={item ? (item.priceCents / 100).toFixed(2).replace('.', ',') : ''}
          required
        />
        <TextField
          name="maxQuantity"
          label={t('maxQuantity')}
          hint={t('maxQuantityHint')}
          state={state}
          inputMode="numeric"
          defaultValue={item?.maxQuantity?.toString() ?? ''}
        />
      </div>
      <TextAreaField
        name="description"
        label={t('description')}
        state={state}
        defaultValue={item?.description ?? ''}
        rows={2}
        maxLength={200}
      />
      <fieldset
        className="space-y-2"
        aria-describedby={allergenError ? `${prefix}-allergens-error` : undefined}
      >
        <legend className="text-sm font-medium">{t('allergens')}</legend>
        <p className="text-xs text-muted-foreground">{t('allergensHint')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {allergens.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allergens"
                value={a}
                defaultChecked={chosen(a)}
                className="size-4 accent-primary"
              />
              {ta(a as 'gluten')}
            </label>
          ))}
        </div>
        <CheckboxField
          name="noAllergens"
          label={t('noAllergens')}
          state={state}
          defaultChecked={item?.noAllergens}
        />
        {allergenError && (
          <p id={`${prefix}-allergens-error`} role="alert" className="text-sm text-destructive">
            {te.has(allergenError as 'invalid') ? te(allergenError as 'invalid') : te('invalid')}
          </p>
        )}
      </fieldset>
      {item && (
        <CheckboxField
          name="active"
          label={t('active')}
          state={state}
          defaultChecked={item.active}
        />
      )}
      <SubmitButton>{item ? t('saveItem') : t('addItem')}</SubmitButton>
    </form>
  );
}
