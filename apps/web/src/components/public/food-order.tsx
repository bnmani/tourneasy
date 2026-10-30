'use client';

import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { Minus, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { PaymentWindow } from '@/components/payments/pay-button';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { placeFoodOrderAction } from '@/server/actions/pricing-food-actions';

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  allergens: string[];
  noAllergens: boolean;
  left: number | null;
};

/** Player: pick quantities, see the total and order (D87). */
export function FoodOrder({ slug, items }: { slug: string; items: MenuItem[] }) {
  const t = useTranslations('Food.player');
  const ta = useTranslations('Food.allergens');
  const te = useTranslations('Errors');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [pending, start] = useTransition();
  const [checkout, setCheckout] = useState<{
    clientSecret: string;
    publishableKey: string;
    returnUrl: string;
    totalCents: number;
  } | null>(null);
  const euro = (c: number) => formatEuro(c, locale);
  const total = items.reduce((n, i) => n + i.priceCents * (qty[i.id] ?? 0), 0);
  const change = (item: MenuItem, d: number) =>
    setQty((q) => {
      const max = Math.min(item.left ?? 20, 20);
      return { ...q, [item.id]: Math.max(0, Math.min(max, (q[item.id] ?? 0) + d)) };
    });

  function order() {
    setError(null);
    setPlaced(false);
    const lines = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
    start(async () => {
      const res = await placeFoodOrderAction(slug, lines);
      if (!res.ok) {
        setError(te.has(res.error as 'invalid') ? te(res.error as 'invalid') : te('unexpected'));
        router.refresh();
      } else if (res.kind === 'pay') {
        setCheckout({
          clientSecret: res.clientSecret,
          publishableKey: res.publishableKey,
          totalCents: res.totalCents,
          returnUrl: `${window.location.origin}/${locale}/payments/done?kind=food&id=${res.orderId}`,
        });
      } else {
        // Refresh in place: the new order and its pickup code appear under "Your orders".
        setQty({});
        setPlaced(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border bg-card">
        {items.map((item) => {
          const n = qty[item.id] ?? 0;
          const soldOut = item.left === 0;
          return (
            <li key={item.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {item.name}{' '}
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {euro(item.priceCents)}
                  </span>
                </p>
                {item.description && (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.noAllergens
                    ? t('noAllergens')
                    : t('contains', {
                        list: item.allergens.map((a) => ta(a as 'gluten')).join(', '),
                      })}
                </p>
                {item.left !== null && (
                  <p className="text-xs text-muted-foreground">
                    {soldOut ? t('soldOut') : t('left', { count: item.left })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => change(item, -1)}
                  disabled={n === 0}
                  aria-label={t('less', { name: item.name })}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="w-6 text-center tabular-nums" aria-live="polite">
                  {n}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => change(item, 1)}
                  disabled={soldOut || n >= Math.min(item.left ?? 20, 20)}
                  aria-label={t('more', { name: item.name })}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm">
        <span>
          {t('total')}: <strong className="tabular-nums">{euro(total)}</strong>
        </span>
        <Button type="button" onClick={order} disabled={pending || total === 0}>
          {t('order')}
        </Button>
      </div>
      {placed && (
        <p role="status" className="rounded-md border bg-secondary px-4 py-3 text-sm">
          {t('placedDone')}
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
    </div>
  );
}
