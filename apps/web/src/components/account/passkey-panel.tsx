'use client';

import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useSyncExternalStore, useTransition } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import {
  addPasskeyAction,
  passkeyRegistrationOptionsAction,
  removePasskeyAction,
} from '@/server/actions/passkey-actions';
import { RecoveryCodes } from './mfa-panel';

const noSubscribe = () => () => {};

/** Adds a passkey on this device (D88). The first second step also shows the recovery codes. */
export function PasskeyAdd({ primary }: { primary: boolean }) {
  const t = useTranslations('Security.passkey');
  const te = useTranslations('Errors');
  const router = useRouter();
  // Checked in the browser only; the server render assumes support.
  const supported = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const message = (code: string) =>
    te.has(code as 'invalid') ? te(code as 'invalid') : te('unexpected');

  function add() {
    setError(null);
    setAdded(false);
    start(async () => {
      const options = await passkeyRegistrationOptionsAction();
      if (!options.ok) return setError(message(options.error));
      let response;
      try {
        response = await startRegistration({ optionsJSON: options.options });
      } catch (e) {
        // Already on this device, cancelled, or timed out.
        return setError(
          e instanceof Error && e.name === 'InvalidStateError' ? t('alreadyAdded') : t('cancelled'),
        );
      }
      const result = await addPasskeyAction(response);
      if (!result.ok) return setError(message(result.error));
      if (result.codes) setCodes(result.codes);
      else {
        setAdded(true);
        router.refresh();
      }
    });
  }

  if (codes) return <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />;
  if (!supported) return <p className="text-sm text-muted-foreground">{t('unsupported')}</p>;
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant={primary ? 'default' : 'outline'}
        onClick={add}
        disabled={pending}
      >
        <KeyRound aria-hidden="true" />
        {t('add')}
      </Button>
      {added && (
        <p role="status" className="text-sm">
          {t('added')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Removes one passkey, with the password. */
export function PasskeyRemove({
  locale,
  passkeyId,
  name,
}: {
  locale: AppLocale;
  passkeyId: string;
  name: string;
}) {
  const t = useTranslations('Security.passkey');
  const tm = useTranslations('Security.mfa');
  const [state, action] = useActionState(
    removePasskeyAction.bind(null, locale, passkeyId),
    initialFormState,
  );
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-destructive">{t('remove')}</summary>
      <form action={action} className="mt-3 max-w-xs space-y-3" noValidate>
        <FormError state={state} />
        <p className="text-muted-foreground">{t('removeHint', { name })}</p>
        <TextField
          name="password"
          type="password"
          label={tm('password')}
          state={state}
          required
          autoComplete="current-password"
        />
        <SubmitButton variant="destructive">{t('remove')}</SubmitButton>
      </form>
    </details>
  );
}
