import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { eventLabel, personName } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { refundDecisionAction, reopenRefundAction } from '@/server/actions/payment-actions';
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
  backPath,
}: {
  locale: AppLocale;
  overview: Awaited<ReturnType<typeof paymentsOverview>>;
  href: (page: number) => string;
  canDecide: boolean;
  /** Where to come back after a reopen (the page this view is on). */
  backPath: string;
}) {
  const tp = await getTranslations('Admin.payments');
  const to = await getTranslations('OrderStatuses');
  const tm = await getTranslations('PaymentMethods');
  const format = await getFormatter();
  const euro = (cents: number) => formatEuro(cents, locale);
  const short = (d: Date) => format.dateTime(d, { dateStyle: 'short', timeStyle: 'short' });
  // Refund lines: the player and the event, in the reader's language (D109).
  type RefundLine = {
    payment: { order: { user: { name: string } } };
    orderItem: {
      description: string;
      participant: { player: Parameters<typeof personName>[0] };
      registration: { event: Parameters<typeof eventLabel>[0] };
    } | null;
  };
  const refundWho = (r: RefundLine) =>
    r.orderItem ? personName(r.orderItem.participant.player) : r.payment.order.user.name;
  const refundWhat = (r: RefundLine) =>
    r.orderItem ? eventLabel(r.orderItem.registration.event, locale) : '';
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
                    {euro(r.amountCents)} · {refundWho(r)}
                  </p>
                  <p className="text-muted-foreground">
                    {r.payment.order.tournament.name} · {refundWhat(r)} ·{' '}
                    {r.payment.order.orderNumber}
                    {r.orderItem && r.amountCents < r.orderItem.amountCents && (
                      // A multi-category price kept part of it (D109).
                      <> · {tp('ofPaid', { paid: euro(r.orderItem.amountCents) })}</>
                    )}
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

      {overview.declinedRefunds.length > 0 && (
        // A decline made by mistake can be reopened by an admin (D99).
        <section aria-labelledby="declined-title" className="space-y-3">
          <h2 id="declined-title" className="text-lg font-semibold">
            {tp('declined')}
          </h2>
          <ul className="divide-y rounded-lg border bg-card opacity-90">
            {overview.declinedRefunds.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {euro(r.amountCents)} · {refundWho(r)}
                  </p>
                  <p className="text-muted-foreground">
                    {r.payment.order.tournament.name} · {refundWhat(r)} ·{' '}
                    {r.payment.order.orderNumber}
                    {r.processedAt && (
                      <>
                        {' '}
                        ·{' '}
                        {format.dateTime(r.processedAt, { dateStyle: 'short', timeStyle: 'short' })}
                      </>
                    )}
                  </p>
                </div>
                {canDecide && (
                  <form action={reopenRefundAction.bind(null, locale, r.id, backPath)}>
                    <Button type="submit" size="sm" variant="outline">
                      {tp('reopen')}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="orders-title" className="space-y-3">
        <h2 id="orders-title" className="text-lg font-semibold">
          {tp('players', { count: overview.total })}
        </h2>
        {overview.players.length === 0 ? (
          <p className="text-muted-foreground">{tp('none')}</p>
        ) : (
          <ScrollRegion label={tp('title')} className="rounded-lg border bg-card">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    {tp('player')}
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
                {overview.players.map((g) => (
                  <tr key={g.key} className="align-top">
                    <td className="px-3 py-3">
                      <span className="font-medium">{personName(g.player)}</span>{' '}
                      <span className="text-xs text-muted-foreground">{g.player.memberNumber}</span>
                      {g.email && (
                        <span className="block text-xs text-muted-foreground">{g.email}</span>
                      )}
                      {g.recordedBy.length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {tp('recordedBy', { names: g.recordedBy.join(', ') })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className="block font-medium">{g.tournament.name}</span>
                      <span className="block text-muted-foreground">
                        {[...new Set(g.lines.map((l) => eventLabel(l.event, locale)))].join(', ')}
                      </span>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-primary">
                          {tp('details', { count: g.lines.length })}
                        </summary>
                        <ul className="mt-2 space-y-1 text-muted-foreground">
                          {g.lines.map((l) => (
                            <li key={l.id}>
                              {eventLabel(l.event, locale)} · {euro(l.amountCents)}
                              {l.refundedCents > 0 && (
                                <> ({tp('refundedShort', { amount: euro(l.refundedCents) })})</>
                              )}{' '}
                              · {l.status === 'PAID' && l.method ? tm(l.method) : to(l.status)} ·{' '}
                              {l.orderNumber} · {short(l.at)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                      {g.paidCents || g.pendingCents ? (
                        euro(g.paidCents || g.pendingCents)
                      ) : (
                        <s className="text-muted-foreground">{euro(g.voidCents)}</s>
                      )}
                      {g.refundedCents > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {tp('refundedShort', { amount: euro(g.refundedCents) })}
                        </span>
                      )}
                      {g.methods.length > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {g.methods.map((m) => tm(m)).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
                          g.status === 'PAID'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {to(g.status)}
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
