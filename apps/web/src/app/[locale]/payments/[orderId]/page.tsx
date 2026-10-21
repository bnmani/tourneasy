import { formatEuro } from '@tourneasy/shared';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { requireActor } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { reconcileOrder } from '@/server/services/payment-service';

type Props = { params: Promise<{ locale: string; orderId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Payments' });
  return { title: t('resultTitle'), robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/** Where Stripe (and the bank, for iDEAL) sends the player back: checks and shows the result. */
export default async function PaymentResultPage({ params }: Props) {
  const locale = await pageLocale(params);
  const { orderId } = await params;
  const actor = await requireActor(locale, `/${locale}/payments/${orderId}`);
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const order = await reconcileOrder(orderId, actor).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!order) notFound();
  const t = await getTranslations('Payments');

  const paid = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.status);
  const processing = !paid && order.paymentStatus === 'PROCESSING';
  const Icon = paid ? CheckCircle2 : processing ? Clock : XCircle;
  const message = paid ? t('resultPaid') : processing ? t('resultProcessing') : t('resultFailed');

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
      <div className="space-y-5 rounded-lg border bg-card p-6 text-center sm:p-8">
        <Icon
          aria-hidden="true"
          className={
            paid ? 'mx-auto size-12 text-primary' : 'mx-auto size-12 text-muted-foreground'
          }
        />
        <h1 className="font-heading text-2xl font-bold">{t('resultTitle')}</h1>
        <p role="status">{message}</p>
        <p className="text-sm text-muted-foreground">
          {order.tournament.name} ·{' '}
          {t('orderLine', {
            orderNumber: order.orderNumber,
            amount: formatEuro(order.totalCents, locale),
          })}
        </p>
        <Button asChild>
          <Link href="/account?tab=upcoming">{t('backToEntries')}</Link>
        </Button>
      </div>
    </div>
  );
}
