'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { FormError, FormSuccess, SubmitButton } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { resendVerificationAction } from '@/server/actions/auth-actions';

export function ResendVerificationForm({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Auth.verify');
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  if (state.ok) return <FormSuccess>{t('resent')}</FormSuccess>;
  return (
    <form action={action} className="space-y-3">
      <FormError state={state} />
      <SubmitButton variant={compact ? 'outline' : 'default'} size={compact ? 'sm' : 'default'}>
        {t('resend')}
      </SubmitButton>
    </form>
  );
}
