'use client';

import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { PaymentWindow } from '@/components/payments/pay-button';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { buyPackageAction } from '@/server/actions/pricing-food-actions';

/** Pricing page: an organiser buys a bundle of Pro credits (D87). */
export function BuyBundle({ label }: { label: string }) {
  const te = useTranslations('Errors');
  const t = useTranslations('Pricing');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [checkout, setCheckout] = useState<{
    clientSecret: string;
    publishableKey: string;
    returnUrl: string;
    totalCents: number;
  } | null>(null);

  function buy() {
    setError(null);
    start(async () => {
      const res = await buyPackageAction({ packageKey: 'BUNDLE', code: code || undefined });
      if (!res.ok) {
        setError(te.has(res.error as 'invalid') ? te(res.error as 'invalid') : te('unexpected'));
      } else if (res.kind === 'pay') {
        setCheckout({
          clientSecret: res.clientSecret,
          publishableKey: res.publishableKey,
          totalCents: res.totalCents,
          returnUrl: `${window.location.origin}/${locale}/payments/done?kind=package&id=${res.purchaseId}`,
        });
      } else {
        router.replace('/pricing?status=packageRequested');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-muted-foreground">{t('code')}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={30}
            className="h-9 w-32 rounded-md border border-input bg-background px-2 text-base sm:text-sm"
          />
        </label>
        <Button type="button" onClick={buy} disabled={pending}>
          {label}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <PaymentWindow
        checkout={checkout}
        amountLabel={checkout ? formatEuro(checkout.totalCents, locale) : ''}
        onClose={() => setCheckout(null)}
      />
    </div>
  );
}
