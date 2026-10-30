'use client';

import { startAuthentication } from '@simplewebauthn/browser';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { passkeyLoginAction, passkeyLoginOptionsAction } from '@/server/actions/passkey-actions';

/** Step two with a passkey (D88): Face ID, Touch ID, a phone or a security key. */
export function PasskeyLogin({
  locale,
  next,
  remember,
}: {
  locale: AppLocale;
  next: string;
  remember: boolean;
}) {
  const t = useTranslations('Auth.mfa');
  const te = useTranslations('Errors');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const message = (code: string) =>
    te.has(code as 'invalid') ? te(code as 'invalid') : te('unexpected');

  function login() {
    setError(null);
    start(async () => {
      const options = await passkeyLoginOptionsAction();
      if (!options.ok) return setError(message(options.error));
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options.options });
      } catch {
        // Cancelled, timed out, or no passkey on this device.
        return setError(t('passkeyCancelled'));
      }
      const result = await passkeyLoginAction(locale, response, remember, next);
      if (!result.ok) return setError(message(result.error));
      window.location.assign(result.target);
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" size="lg" className="w-full" onClick={login} disabled={pending}>
        <KeyRound aria-hidden="true" />
        {t('usePasskey')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
