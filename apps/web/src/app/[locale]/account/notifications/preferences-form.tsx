'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, FormSuccess, SubmitButton } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { saveNotificationPreferencesAction } from '@/server/actions/account-actions';

/** Checkboxes for the optional emails (D62). */
export function PreferencesForm({ prefs }: { prefs: { type: string; enabled: boolean }[] }) {
  const t = useTranslations('Notifications');
  const [state, action] = useActionState(saveNotificationPreferencesAction, initialFormState);
  return (
    <form action={action} className="space-y-4">
      <FormError state={state} />
      {state.ok && <FormSuccess>{t('saved')}</FormSuccess>}
      <ul className="space-y-3">
        {prefs.map((p) => (
          <li key={p.type}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name={p.type}
                defaultChecked={p.enabled}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span>
                <span className="block font-medium">
                  {t(`type.${p.type}` as 'type.ANNOUNCEMENT')}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {t(`hint.${p.type}` as 'hint.ANNOUNCEMENT')}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <SubmitButton>{t('save')}</SubmitButton>
    </form>
  );
}
