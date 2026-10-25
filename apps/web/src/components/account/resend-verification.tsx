'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect } from 'react';
import { FormError, FormSuccess, SubmitButton } from '@/components/forms/fields';
import { initialFormState } from '@/components/forms/form-state';
import { emailVerifiedNowAction, resendVerificationAction } from '@/server/actions/auth-actions';

export function ResendVerificationForm({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('Auth.verify');
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  const router = useRouter();
  // Confirmed on another device (the link opened on a phone)? Update this page by itself.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (await emailVerifiedNowAction()) {
        stopped = true;
        router.refresh();
      }
    };
    const id = setInterval(check, 5000);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [router]);
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
