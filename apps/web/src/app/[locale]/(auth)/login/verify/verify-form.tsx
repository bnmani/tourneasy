'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { verifyLoginAction } from '@/server/actions/auth-actions';

export function VerifyForm({
  locale,
  next,
  remember,
  app = true,
  passkey = false,
}: {
  locale: AppLocale;
  next: string;
  remember: boolean;
  /** The authenticator app is on; without it only a recovery code can be typed here. */
  app?: boolean;
  /** A passkey is on: without the app, the recovery code hides behind a link (D105). */
  passkey?: boolean;
}) {
  const t = useTranslations('Auth.mfa');
  const [state, action] = useActionState(verifyLoginAction.bind(null, locale), initialFormState);
  // The app's code is digits: open the number pad. Recovery codes have letters.
  const [recovery, setRecovery] = useState(!app);
  // Passkey only: nothing to type unless they ask for a recovery code.
  const [shown, setShown] = useState(app || !passkey);
  const linkClass =
    'text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
  if (!shown) {
    return (
      <button type="button" onClick={() => setShown(true)} className={linkClass}>
        {t('usePasskeyRecovery')}
      </button>
    );
  }
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormError state={state} />
      <input type="hidden" name="next" value={next} />
      {remember && <input type="hidden" name="remember" value="1" />}
      <TextField
        key={recovery ? 'recovery' : 'app'}
        name="code"
        label={recovery ? t('recoveryCode') : t('code')}
        hint={recovery ? t('recoveryHint') : t('codeHint')}
        state={state}
        required
        autoComplete={recovery ? 'off' : 'one-time-code'}
        inputMode={recovery ? 'text' : 'numeric'}
        maxLength={recovery ? 20 : 6}
      />
      <SubmitButton size="lg">{t('submit')}</SubmitButton>
      {app ? (
        <button
          type="button"
          onClick={() => setRecovery((r) => !r)}
          className={`block ${linkClass}`}
        >
          {recovery ? t('useApp') : t('useRecovery')}
        </button>
      ) : (
        passkey && (
          <button type="button" onClick={() => setShown(false)} className={`block ${linkClass}`}>
            {t('hideRecovery')}
          </button>
        )
      )}
    </form>
  );
}
