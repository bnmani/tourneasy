import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { cn } from '@/lib/utils';
import { refundDecisionAction } from '@/server/actions/payment-actions';
import type { paymentsOverview } from '@/server/services/payment-service';

/**
 * Money in and out (D51): totals, refund requests and orders. Used for all tournaments (admin)
 * and per tournament (its organisers too, D75); only admins decide on refunds.
 */
export async function PaymentsView({
  locale,
  overview,
  href,
  canDecide,
}: {
  locale: AppLocale;
  overview: Awaited<ReturnType<typeof paymentsOverview>>;
  href: (page: number) => string;
  canDecide: boolean;
}) {
  const tp = await getTranslations('Admin.payments');
  const to = await getTranslations('OrderStatuses');
  const tm = await getTranslations('PaymentMethods');
  const format = await getFormatter();
  const euro = (cents: number) => formatEuro(cents, locale);
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          { label: tp('received'), value: euro(overview.totals.paidCents) },
          { label: tp('refunded'), value: euro(overview.totals.refundedCents) },
          {
            label: tp('outstanding', { count: overview.totals.outstandingShares }),
            value: euro(overview.totals.outstandingCents),
          },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{card.label}</dt>
            <dd className="mt-1 font-heading text-2xl font-bold">{card.value}</dd>
          </div>
        ))}
      </dl>

      {overview.refundRequests.length > 0 && (
        <section aria-labelledby="refunds-title" className="space-y-3">
          <h2 id="refunds-title" className="text-lg font-semibold">
            {tp('refundRequests')}
          </h2>
          <ul className="space-y-2">
            {overview.refundRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-medium">
                    {euro(r.amountCents)} · {r.payment.order.user.name}
                  </p>
                  <p className="text-muted-foreground">
                    {r.payment.order.tournament.name} · {r.orderItem?.description} ·{' '}
                    {r.payment.order.orderNumber}
                    {r.payment.method === 'MANUAL' && <> · {tp('manualRefund')}</>}
                  </p>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <form action={refundDecisionAction.bind(null, locale, r.id, true)}>
                      <Button type="submit" size="sm">
                        {tp('approve')}
                      </Button>
                    </form>
                    <form action={refundDecisionAction.bind(null, locale, r.id, false)}>
                      <Button type="submit" size="sm" variant="outline">
                        {tp('reject')}
                      </Button>
                    </form>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{tp('adminDecides')}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="orders-title" className="space-y-3">
        <h2 id="orders-title" className="text-lg font-semibold">
          {tp('orders', { count: overview.total })}
        </h2>
        {overview.orders.length === 0 ? (
          <p className="text-muted-foreground">{tp('none')}</p>
        ) : (
          <ScrollRegion label={tp('title')} className="rounded-lg border bg-card">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    {tp('order')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {tp('payer')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {tp('items')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    {tp('amount')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {tp('status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overview.orders.map((o) => (
                  <tr key={o.id} className="align-top">
                    <td className="px-3 py-3">
                      <span className="font-medium">{o.orderNumber}</span>
                      <span className="block text-xs text-muted-foreground">
                        {format.dateTime(o.paidAt ?? o.createdAt, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {o.user.name}
                      <span className="block text-xs text-muted-foreground">{o.user.email}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className="block font-medium">{o.tournament.name}</span>
                      {o.items.map((i) => (
                        <span key={i.description} className="block text-muted-foreground">
                          {i.description}
                          {i.refundedCents > 0 && (
                            <> ({tp('refundedShort', { amount: euro(i.refundedCents) })})</>
                          )}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                      {euro(o.totalCents)}
                      {o.payments[0]?.method && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {tm(o.payments[0].method)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
                          o.status === 'PAID'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {to(o.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <Pagination page={overview.page} pages={overview.pages} href={href} />
      </section>
    </>
  );
}
