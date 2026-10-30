'use client';

import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { PaymentWindow } from '@/components/payments/pay-button';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { buyPackageAction, applyBundleCreditAction } from '@/server/actions/pricing-food-actions';

type Quote = {
  priceCents: number;
  discountCents: number;
  netCents: number;
  vatCents: number;
  totalCents: number;
};

export type PackageCardData = {
  current: string | null;
  onlinePayment: boolean;
  discount: { percent: number; clubName: string } | null;
  creditsLeft: number;
  pending: { id: string; packageKey: string; status: string; totalCents: number } | null;
  entries: number;
  options: { key: string; maxPlayers: number | null; quote: Quote }[];
};

/** The tournament's package (D87): shown on the overview only while pricing is switched on. */
export function PackageCard({
  tournamentId,
  data,
}: {
  tournamentId: string;
  data: PackageCardData;
}) {
  const t = useTranslations('Admin.package');
  const tp = useTranslations('Packages');
  const te = useTranslations('Errors');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [choice, setChoice] = useState(data.current ?? data.options[0]?.key ?? 'FREE');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'saved' | 'requested' | null>(null);
  const [pending, start] = useTransition();
  const [checkout, setCheckout] = useState<{
    clientSecret: string;
    publishableKey: string;
    returnUrl: string;
    totalCents: number;
  } | null>(null);
  const euro = (c: number) => formatEuro(c, locale);
  const chosen = data.options.find((o) => o.key === choice);

  function buy() {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await buyPackageAction({
        packageKey: choice,
        tournamentId,
        code: code || undefined,
      });
      if (!res.ok) {
        setError(te.has(res.error as 'invalid') ? te(res.error as 'invalid') : te('unexpected'));
        return;
      }
      if (res.kind === 'pay') {
        setCheckout({
          clientSecret: res.clientSecret,
          publishableKey: res.publishableKey,
          totalCents: res.totalCents,
          returnUrl: `${window.location.origin}/${locale}/payments/done?kind=package&id=${res.purchaseId}`,
        });
        return;
      }
      // Refresh in place; a redirect to this page with #package can leave it waiting.
      setDone(res.kind === 'done' ? 'saved' : 'requested');
      router.refresh();
    });
  }

  return (
    <section id="package" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <span className="text-sm">
          {data.current ? (
            <>
              {t('current')}: <strong>{tp(`${data.current}.name` as 'FREE.name')}</strong>
            </>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">{t('none')}</span>
          )}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {data.current ? t('introChange') : t('introNone')} {t('entries', { count: data.entries })}
      </p>

      {data.pending && (
        <p role="status" className="rounded-md border bg-secondary px-4 py-3 text-sm">
          {t(data.pending.status === 'REQUESTED' ? 'pendingInvoice' : 'pendingPayment', {
            name: tp(`${data.pending.packageKey}.name` as 'FREE.name'),
            total: euro(data.pending.totalCents),
          })}
        </p>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t('choose')}</legend>
        {data.options.map((o) => {
          const tooSmall = o.maxPlayers !== null && data.entries > o.maxPlayers;
          return (
            <label
              key={o.key}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                choice === o.key && 'border-primary bg-primary/5',
                tooSmall && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="package"
                  value={o.key}
                  checked={choice === o.key}
                  disabled={tooSmall}
                  onChange={() => setChoice(o.key)}
                  className="accent-primary"
                />
                {tp(`${o.key}.name` as 'FREE.name')}
                {data.current === o.key && (
                  <span className="text-xs text-muted-foreground">({t('yours')})</span>
                )}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {o.quote.priceCents === 0 ? t('free') : euro(o.quote.netCents)}
              </span>
              {o.quote.priceCents > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t('plusVat', { total: euro(o.quote.totalCents) })}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {o.maxPlayers === null ? t('unlimited') : t('upTo', { count: o.maxPlayers })}
              </span>
            </label>
          );
        })}
      </fieldset>

      {data.discount && (
        <p className="text-sm text-muted-foreground">
          {t('discount', { percent: data.discount.percent, club: data.discount.clubName })}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {!data.discount && chosen && chosen.quote.priceCents > 0 && (
          <label className="text-sm">
            <span className="block font-medium">{t('code')}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={30}
              className="h-10 w-40 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
            />
          </label>
        )}
        <Button
          type="button"
          onClick={buy}
          disabled={pending || !chosen || choice === data.current}
        >
          {!chosen || chosen.quote.priceCents === 0
            ? t('choose')
            : data.onlinePayment
              ? t('pay', { total: euro(chosen.quote.totalCents) })
              : t('requestInvoice')}
        </Button>
        {data.creditsLeft > 0 && data.current !== 'PRO' && (
          <form action={applyBundleCreditAction.bind(null, locale, tournamentId)}>
            <Button type="submit" variant="outline">
              {t('useCredit', { count: data.creditsLeft })}
            </Button>
          </form>
        )}
      </div>
      {!data.onlinePayment && <p className="text-xs text-muted-foreground">{t('invoiceHint')}</p>}
      {done && (
        <p role="status" className="rounded-md border bg-secondary px-4 py-3 text-sm">
          {done === 'saved' ? t('chosen') : t('requested')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <PaymentWindow
        checkout={checkout}
        amountLabel={checkout ? euro(checkout.totalCents) : ''}
        onClose={() => setCheckout(null)}
      />
    </section>
  );
}
