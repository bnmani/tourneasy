'use client';

import type { AppLocale } from '@tourneasy/shared/i18n';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import {
  type CodesState,
  confirmMfaAction,
  disableMfaAction,
  newRecoveryCodesAction,
} from '@/server/actions/mfa-actions';

/** The recovery codes, shown once, with copy and "saved them". */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const t = useTranslations('Security.mfa');
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 rounded-md border border-amber-500/60 bg-amber-500/10 p-4">
      <h3 className="font-semibold">{t('recoveryTitle')}</h3>
      <p className="text-sm">{t('recoveryIntro')}</p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-3">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join('\n')).then(() => setCopied(true));
          }}
        >
          {copied ? t('recoveryCopied') : t('recoveryCopy')}
        </Button>
        <Button type="button" size="sm" onClick={() => router.refresh()}>
          {t('recoveryDone')}
        </Button>
      </div>
    </div>
  );
}

const codeField = (label: string, state: CodesState) => (
  <TextField
    name="code"
    label={label}
    state={state}
    required
    autoComplete="one-time-code"
    inputMode="numeric"
    maxLength={20}
  />
);

/** Scan, type the first code, get the recovery codes. */
export function MfaSetup({ qrSvg, secret }: { qrSvg: string; secret: string }) {
  const t = useTranslations('Security.mfa');
  const [state, action] = useActionState<CodesState, FormData>(confirmMfaAction, initialFormState);
  if (state.codes) return <RecoveryCodes codes={state.codes} />;
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{t('step1')}</p>
      <div
        role="img"
        aria-label={t('qrAlt')}
        className="size-48 rounded-md border bg-white p-2 [&>svg]:size-full"
        // Generated on our server from the secret; no user input.
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <p className="text-sm text-muted-foreground">
        {t('manual')} <code className="font-mono text-foreground select-all">{secret}</code>
      </p>
      <form action={action} className="max-w-xs space-y-4" noValidate>
        <FormError state={state} />
        <p className="text-sm font-medium">{t('step2')}</p>
        {codeField(t('code'), state)}
        <SubmitButton>{t('confirm')}</SubmitButton>
      </form>
    </div>
  );
}

export function MfaNewCodes() {
  const t = useTranslations('Security.mfa');
  const [state, action] = useActionState<CodesState, FormData>(
    newRecoveryCodesAction,
    initialFormState,
  );
  if (state.codes) return <RecoveryCodes codes={state.codes} />;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">{t('newCodes')}</summary>
      <form action={action} className="mt-3 max-w-xs space-y-3" noValidate>
        <FormError state={state} />
        <p className="text-muted-foreground">{t('newCodesHint')}</p>
        {codeField(t('code'), state)}
        <SubmitButton variant="outline">{t('newCodes')}</SubmitButton>
      </form>
    </details>
  );
}

export function MfaDisable({ locale, staff }: { locale: AppLocale; staff: boolean }) {
  const t = useTranslations('Security.mfa');
  const [state, action] = useActionState(disableMfaAction.bind(null, locale), initialFormState);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-destructive">{t('disable')}</summary>
      <form action={action} className="mt-3 max-w-xs space-y-3" noValidate>
        <FormError state={state} />
        <p className="text-muted-foreground">
          {staff ? t('disableHintStaff') : t('disableHintPlayer')}
        </p>
        <TextField
          name="password"
          type="password"
          label={t('password')}
          state={state}
          required
          autoComplete="current-password"
        />
        {codeField(t('code'), state)}
        <SubmitButton variant="destructive">{t('disable')}</SubmitButton>
      </form>
    </details>
  );
}
