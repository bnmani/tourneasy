'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  CheckboxField,
  FormError,
  FormSection,
  FormSuccess,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { saveClubDiscountAction, savePricingAction } from '@/server/actions/pricing-food-actions';

const input =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

type Plan = {
  key: string;
  priceCents: number;
  maxPlayers: number | null;
  visible: boolean;
  credits?: number;
};

/** Owner: switch pricing on, prices per package, online payment, invoice details (D87). */
export function PricingForm({
  locale,
  values,
}: {
  locale: AppLocale;
  values: {
    enabled: boolean;
    onlinePayment: boolean;
    plans: Plan[];
    company: Record<string, string>;
  };
}) {
  const t = useTranslations('Admin.pricing');
  const tp = useTranslations('Packages');
  const [state, action] = useActionState(savePricingAction.bind(null, locale), initialFormState);
  const euros = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '');
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormError state={state} />
      <FormSection title={t('switches')}>
        <CheckboxField
          name="enabled"
          label={t('enabled')}
          state={state}
          defaultChecked={values.enabled}
        />
        <p className="text-sm text-muted-foreground">{t('enabledHint')}</p>
        <CheckboxField
          name="onlinePayment"
          label={t('onlinePayment')}
          state={state}
          defaultChecked={values.onlinePayment}
        />
        <p className="text-sm text-muted-foreground">{t('onlinePaymentHint')}</p>
      </FormSection>

      <FormSection title={t('packages')}>
        <p className="text-sm text-muted-foreground">{t('packagesHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-2 pr-3">{t('package')}</th>
                <th className="py-2 pr-3">{t('price')}</th>
                <th className="py-2 pr-3">{t('maxPlayers')}</th>
                <th className="py-2 pr-3">{t('visible')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {values.plans.map((p) => (
                <tr key={p.key}>
                  <td className="py-2 pr-3 font-medium">
                    {tp(`${p.key}.name` as 'FREE.name')}
                    <div className="text-xs font-normal text-muted-foreground">
                      {tp(`${p.key}.unit` as 'FREE.unit')}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      name={`${p.key}.price`}
                      defaultValue={euros(p.priceCents)}
                      inputMode="decimal"
                      aria-label={`${t('price')}: ${tp(`${p.key}.name` as 'FREE.name')}`}
                      className={`${input} w-28`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {p.key === 'FREE' || p.key === 'STANDARD' ? (
                      <input
                        name={`${p.key}.maxPlayers`}
                        defaultValue={p.maxPlayers ?? ''}
                        inputMode="numeric"
                        aria-label={`${t('maxPlayers')}: ${tp(`${p.key}.name` as 'FREE.name')}`}
                        className={`${input} w-24`}
                      />
                    ) : p.key === 'BUNDLE' ? (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          name="BUNDLE.credits"
                          defaultValue={p.credits ?? 5}
                          inputMode="numeric"
                          className={`${input} w-20`}
                        />
                        {t('credits')}
                      </label>
                    ) : (
                      <span className="text-muted-foreground">{t('unlimited')}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      name={`${p.key}.visible`}
                      defaultChecked={p.visible}
                      aria-label={`${t('visible')}: ${tp(`${p.key}.name` as 'FREE.name')}`}
                      className="size-5 accent-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FormSection>

      <FormSection title={t('company')}>
        <p className="text-sm text-muted-foreground">{t('companyHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['name', 'address', 'kvk', 'vatNumber', 'email', 'iban'] as const).map((k) => (
            <TextField
              key={k}
              name={`company.${k}`}
              label={t(`companyFields.${k}`)}
              state={state}
              defaultValue={values.company[k] ?? ''}
              maxLength={k === 'address' ? 300 : 120}
            />
          ))}
        </div>
      </FormSection>
      <SubmitButton>{t('save')}</SubmitButton>
    </form>
  );
}

/** Owner: add or change a club's discount. */
export function ClubDiscountForm({
  locale,
  clubs,
}: {
  locale: AppLocale;
  clubs: { id: string; name: string }[];
}) {
  const t = useTranslations('Admin.pricing');
  const [state, action] = useActionState(
    saveClubDiscountAction.bind(null, locale),
    initialFormState,
  );
  return (
    <form action={action} className="space-y-3" noValidate>
      <FormError state={state} />
      {state.ok && <FormSuccess>{t('discountSaved')}</FormSuccess>}
      <div className="grid gap-3 sm:grid-cols-[2fr_6rem_10rem_1fr_2fr_auto] sm:items-end">
        <label className="text-sm">
          <span className="block font-medium">{t('club')}</span>
          <select name="clubId" required className={input} defaultValue="">
            <option value="" disabled>
              {t('chooseClub')}
            </option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium">{t('percent')}</span>
          <input name="percent" inputMode="numeric" required className={input} />
        </label>
        <label className="text-sm">
          <span className="block font-medium">{t('validUntil')}</span>
          <input name="validUntil" type="date" className={input} />
        </label>
        <label className="text-sm">
          <span className="block font-medium">{t('code')}</span>
          <input name="code" className={input} />
        </label>
        <label className="text-sm">
          <span className="block font-medium">{t('note')}</span>
          <input name="note" className={input} />
        </label>
        <SubmitButton>{t('addDiscount')}</SubmitButton>
      </div>
      {state.fields && (
        <p role="alert" className="text-sm text-destructive">
          {t('discountInvalid')}
        </p>
      )}
    </form>
  );
}
