'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { startCheckoutAction, type CheckoutResult } from '@/server/actions/payment-actions';

// Stripe.js is loaded once per publishable key, and only when someone opens the payment window.
const stripes = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  if (!stripes.has(key)) stripes.set(key, loadStripe(key));
  return stripes.get(key)!;
}

type Ready = Extract<CheckoutResult, { ok: true }>;

/**
 * "Pay €25" button that opens a payment window with Stripe's Payment Element (iDEAL first,
 * plus whatever else is switched on in Stripe). After paying, iDEAL sends the player to the
 * bank and back to /payments/{orderId}, which checks the result (D51).
 */
export function PayButton({
  participantIds,
  amountLabel,
  autoOpen = false,
}: {
  participantIds: string[];
  amountLabel: string;
  autoOpen?: boolean;
}) {
  const t = useTranslations('Payments');
  const te = useTranslations('Errors');
  const locale = useLocale();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [checkout, setCheckout] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    dialog.current?.showModal();
    setError(null);
    setLoading(true);
    const result = await startCheckoutAction(participantIds);
    setLoading(false);
    if (!result.ok) {
      setError(te((result.error === 'validation' ? 'invalid' : result.error) as 'unexpected'));
      return;
    }
    if (!result.clientSecret) {
      // Nothing left to pay after the discount: the entries are confirmed.
      dialog.current?.close();
      router.refresh();
      return;
    }
    setCheckout(result);
  }

  useEffect(() => {
    // Only on first render: the dashboard opens the window straight after entering. Opening
    // fetches the checkout from the server, a real side effect, so it belongs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoOpen) void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Button type="button" onClick={() => void open()}>
        {t('payButton', { amount: amountLabel })}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="pay-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 id="pay-title" className="font-heading text-lg font-semibold">
            {t('dialogTitle')}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-md p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{t('close')}</span>
          </button>
        </div>
        <div className="space-y-4 p-5">
          {loading && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {checkout?.clientSecret && (
            <>
              <p className="text-sm text-muted-foreground">
                {t('orderLine', { orderNumber: checkout.orderNumber ?? '', amount: amountLabel })}
              </p>
              <Elements
                stripe={stripeFor(checkout.publishableKey)}
                options={{
                  clientSecret: checkout.clientSecret,
                  locale: locale === 'nl' ? 'nl' : 'en',
                  appearance: {
                    theme: 'stripe',
                    variables: { colorPrimary: '#2e4a67', borderRadius: '8px' },
                  },
                }}
              >
                <CheckoutForm
                  returnUrl={`${window.location.origin}/${locale}/payments/${checkout.orderId!}`}
                  amountLabel={amountLabel}
                />
              </Elements>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

function CheckoutForm({ returnUrl, amountLabel }: { returnUrl: string; amountLabel: string }) {
  const t = useTranslations('Payments');
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    // Only reached when the payment could not start (e.g. card declined); otherwise Stripe redirects.
    setError(failure?.message ?? t('failed'));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!stripe || busy}>
        {busy ? t('processing') : t('payNow', { amount: amountLabel })}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t('secureNote')}</p>
    </form>
  );
}

/**
 * A payment window for anything paid with a PaymentIntent made on the server (packages, food,
 * D87): opened with the client secret; Stripe returns the payer to `returnUrl`.
 */
export function PaymentWindow({
  checkout,
  amountLabel,
  onClose,
}: {
  checkout: { clientSecret: string; publishableKey: string; returnUrl: string } | null;
  amountLabel: string;
  onClose: () => void;
}) {
  const t = useTranslations('Payments');
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (checkout && !dialog.current?.open) dialog.current?.showModal();
  }, [checkout]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="pay-window-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 id="pay-window-title" className="font-heading text-lg font-semibold">
          {t('dialogTitle')}
        </h2>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="rounded-md p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">{t('close')}</span>
        </button>
      </div>
      <div className="p-5">
        {checkout && (
          <Elements
            stripe={stripeFor(checkout.publishableKey)}
            options={{
              clientSecret: checkout.clientSecret,
              locale: locale === 'nl' ? 'nl' : 'en',
              appearance: {
                theme: 'stripe',
                variables: { colorPrimary: '#2e4a67', borderRadius: '8px' },
              },
            }}
          >
            <CheckoutForm returnUrl={checkout.returnUrl} amountLabel={amountLabel} />
          </Elements>
        )}
      </div>
    </dialog>
  );
}
