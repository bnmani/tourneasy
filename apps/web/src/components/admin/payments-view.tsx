import { formatEuro } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { eventLabel, personName } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import { PerPage } from '@/components/admin/per-page';
import { refundDecisionAction, reopenRefundAction } from '@/server/actions/payment-actions';
import type { paymentsOverview } from '@/server/services/payment-service';

/**
 * Money in and out (D51): totals, refund requests and orders. Used for all tournaments (admin)
 * and per tournament (its organisers too, D75); only admins decide on refunds.
 */
export async function PaymentsView({
  locale,
  overview,
  basePath,
  query,
  canDecide,
  backPath,
}: {
  locale: AppLocale;
  overview: Awaited<ReturnType<typeof paymentsOverview>>;
  /** This page without the locale, e.g. /admin/payments. */
  basePath: string;
  /** The page's other filters (tournament, status), kept in every link. */
  query: [string, string][];
  canDecide: boolean;
  /** Where to come back after a reopen (the page this view is on). */
  backPath: string;
}) {
  const link = (extra: Record<string, string | null>) => {
    const params = new URLSearchParams(query);
    if (overview.view) params.set('view', overview.view);
    if (overview.perPage !== 25) params.set('perPage', String(overview.perPage));
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const href = (p: number) => link({ page: String(p) });
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
      {/* Four boxes; a click shows only what that box counts, again to show all (D111). */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { view: 'paid', label: tp('received'), value: overview.totals.paidCents },
            { view: 'refunded', label: tp('refunded'), value: overview.totals.refundedCents },
            { view: 'waived', label: tp('waived'), value: overview.totals.waivedCents },
            {
              view: 'outstanding',
              label: tp('outstanding', { count: overview.totals.outstandingShares }),
              value: overview.totals.outstandingCents,
            },
          ] as const
        ).map((card) => {
          const active = overview.view === card.view;
          return (
            <li key={card.view}>
              <Link
                href={link({ view: active ? null : card.view, page: null })}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'block rounded-lg border bg-card p-4 hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active && 'border-primary bg-primary/5',
                )}
              >
                <span className="block text-sm text-muted-foreground">{card.label}</span>
                <span className="mt-1 block font-heading text-2xl font-bold">
                  {euro(card.value)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {overview.view && (
        <p className="text-sm text-muted-foreground">
          {tp(`showing.${overview.view}`)}{' '}
          <Link href={link({ view: null, page: null })} className="text-primary underline">
            {tp('showAll')}
          </Link>
        </p>
      )}

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

      {overview.view === 'outstanding' && (
        <section aria-labelledby="outstanding-title" className="space-y-3">
          <h2 id="outstanding-title" className="text-lg font-semibold">
            {tp('outstandingTitle', { count: overview.outstandingPlayers.length })}
          </h2>
          {overview.outstandingPlayers.length === 0 ? (
            <p className="text-muted-foreground">{tp('nothingOutstanding')}</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {overview.outstandingPlayers.map((o) => (
                <li
                  key={o.key}
                  className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{personName(o.player)}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.tournament.name} ·{' '}
                      {o.lines
                        .map((l) => `${eventLabel(l.event, locale)} ${euro(l.amountCents)}`)
                        .join(', ')}
                    </p>
                  </div>
                  <p className="font-medium whitespace-nowrap">{euro(o.dueCents)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {overview.view === 'waived' && overview.waivedShares.length > 0 && (
        <section aria-labelledby="waived-title" className="space-y-3">
          <h2 id="waived-title" className="text-lg font-semibold">
            {tp('waivedTitle', { count: overview.waivedShares.length })}
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {overview.waivedShares.map((w) => (
              <li
                key={w.id}
                className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:justify-between"
              >
                <div>
                  <p className="font-medium">{personName(w.player)}</p>
                  <p className="text-xs text-muted-foreground">
                    {w.registration.event.tournament.name} ·{' '}
                    {eventLabel(w.registration.event, locale)}
                    {w.waivedBy && <> · {tp('waivedBy', { name: w.waivedBy })}</>}
                    {w.waivedAt && <> · {short(w.waivedAt)}</>}
                  </p>
                </div>
                <p className="font-medium whitespace-nowrap">{euro(w.waivedCents)}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{tp('waivedUndoHint')}</p>
        </section>
      )}

      <section aria-labelledby="orders-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="orders-title" className="text-lg font-semibold">
            {tp('players', { count: overview.total })}
          </h2>
          <PerPage
            current={overview.perPage}
            href={(n) => link({ perPage: n === 25 ? null : String(n), page: null })}
          />
        </div>
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
                      {g.discountCents > 0 && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {tp('discountShort', { amount: euro(g.discountCents) })}
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
