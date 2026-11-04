import type { RegistrationStatus } from '@tourneasy/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AddEntryForm } from '@/components/admin/add-entry-form';
import {
  FilterBar,
  filterInputClass,
  PageHeader,
  Pagination,
  StatusNotice,
} from '@/components/admin/ui';
import { PerPage } from '@/components/admin/per-page';
import { PAGE_SIZE, pageSize } from '@/server/lib/validation';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { Link } from '@/i18n/navigation';
import { eventLabel, personName } from '@/lib/labels';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { QuickButton } from '@/components/desk/quick-buttons';
import { QuickFormButton } from '@/components/admin/quick-form-button';
import { SortHeader } from '@/components/admin/sort-header';
import { restoreEntryAction, undoSharePaymentAction } from '@/server/actions/match-actions';
import {
  markPaidAction,
  markPaidWithCodeAction,
  waiveShareAction,
} from '@/server/actions/payment-actions';
import { formatEuro } from '@tourneasy/shared';
import { cancelEntryAction } from '@/server/actions/registration-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import {
  listCancelledEntries,
  listTournamentEntries,
} from '@/server/services/registration-service';
import { getTournament } from '@/server/services/tournament-service';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.entries' });
  return { title: t('tab'), robots: { index: false } };
}

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export default async function EntriesPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const isOwner = actor.roles.includes('OWNER');
  const query = await searchParams;
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();

  const eventId = firstParam(query.eventId) || undefined;
  const cancelled = firstParam(query.state) === 'cancelled';
  const q = firstParam(query.q)?.trim().slice(0, 80) || undefined;
  const status: RegistrationStatus | undefined = cancelled ? 'CANCELLED' : undefined;
  const [listed, allCancelled] = await Promise.all([
    listTournamentEntries(actor, id, { eventId, status, q }),
    listCancelledEntries(actor, id),
  ]);
  // Sorting by a column heading (D111); the tournament's event order otherwise.
  const SORTS = ['event', 'player', 'status', 'payment', 'entered'] as const;
  type Sort = (typeof SORTS)[number];
  const sortParam = firstParam(query.sort);
  const sort: Sort | null = (SORTS as readonly string[]).includes(sortParam ?? '')
    ? (sortParam as Sort)
    : null;
  const dir = firstParam(query.dir) === 'desc' ? 'desc' : 'asc';
  const sortKey = (r: (typeof listed)[number]): string | number => {
    const first = r.participants[0];
    if (sort === 'event') return eventLabel(r.event, locale).toLowerCase();
    if (sort === 'player') return first ? personName(first.player).toLowerCase() : '';
    if (sort === 'status') return r.status;
    if (sort === 'payment') return first?.paymentStatus ?? '';
    return r.createdAt.getTime();
  };
  const sorted = sort
    ? [...listed].sort((a, b) => {
        const x = sortKey(a);
        const y = sortKey(b);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return dir === 'asc' ? c : -c;
      })
    : listed;
  // 25, 50, 75 or 100 entries per page, as on the other lists (D112).
  const perPage = pageSize(Number(firstParam(query.perPage)) || undefined);
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const page = Math.min(pages, Math.max(1, Number(firstParam(query.page) ?? 1) || 1));
  const entries = sorted.slice((page - 1) * perPage, page * perPage);
  const listParams = (extra: [string, string][]) =>
    `/admin/tournaments/${id}/entries?${new URLSearchParams([
      ...(eventId ? [['eventId', eventId]] : []),
      ...(q ? [['q', q]] : []),
      ...(cancelled ? [['state', 'cancelled']] : []),
      ...extra,
    ])}`;
  const sizeParam = (n: number): [string, string][] =>
    n === PAGE_SIZE ? [] : [['perPage', String(n)]];
  const sortParams: [string, string][] = sort
    ? [
        ['sort', sort],
        ['dir', dir],
      ]
    : [];
  const sortHref = (column: string, d: 'asc' | 'desc') =>
    listParams([['sort', column], ['dir', d], ...sizeParam(perPage)]);
  const pageHref = (p: number) =>
    listParams([...sortParams, ...sizeParam(perPage), ['page', String(p)]]);
  const sizeHref = (n: number) => listParams([...sortParams, ...sizeParam(n)]);
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const cancelledEntries = allCancelled.filter(
    (c) =>
      (!eventId || c.event.id === eventId) &&
      words.every((w) =>
        c.players.some((p) =>
          [p.firstName, p.lastNamePrefix, p.lastName, p.memberNumber]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(w)),
        ),
      ),
  );

  const t = await getTranslations('Admin');
  const ts = await getTranslations('RegistrationStatuses');
  const tpay = await getTranslations('PaymentStatuses');
  const format = await getFormatter();
  const exportQuery = new URLSearchParams({
    ...(eventId ? { eventId } : {}),
    ...(status ? { status } : {}),
  });
  // Teams per event over all events, whatever the event filter (D106).
  const allLive = eventId && !cancelled ? await listTournamentEntries(actor, id, {}) : listed;
  const perEvent = tournament.events.map((e) => {
    const of = allLive.filter((r) => r.event.id === e.id);
    return {
      id: e.id,
      label: eventLabel(e, locale),
      teams: of.filter((r) => r.status === 'CONFIRMED' || r.status === 'PENDING').length,
      waiting: of.filter((r) => r.status === 'WAITLISTED').length,
    };
  });
  const totalTeams = perEvent.reduce((n, e) => n + e.teams, 0);
  const totalWaiting = perEvent.reduce((n, e) => n + e.waiting, 0);
  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-sm text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      active && 'border-primary bg-primary/5 font-medium',
    );

  return (
    <>
      <PageHeader
        title={t('entries.title', { tournament: tournament.name })}
        intro={t('entries.intro')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/admin/tournaments/${id}/entries/import`}>{t('entries.import')}</Link>
            </Button>
            <Button asChild>
              <a href={`/api/v1/admin/tournaments/${id}/entries/export?${exportQuery}`} download>
                {t('entries.export')}
              </a>
            </Button>
          </>
        }
      />
      <StatusNotice status={firstParam(query.status)} />

      <details className="rounded-lg border bg-card p-4 sm:p-6" open={sorted.length === 0}>
        <summary className="cursor-pointer text-lg font-semibold">{t('addEntry.title')}</summary>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">{t('addEntry.intro')}</p>
        <AddEntryForm
          locale={locale}
          tournamentId={id}
          events={tournament.events.map((e) => ({
            id: e.id,
            label: eventLabel(e, locale),
            doubles: e.discipline === 'HD' || e.discipline === 'DD' || e.discipline === 'GD',
          }))}
        />
      </details>

      <FilterBar action={`/${locale}/admin/tournaments/${id}/entries`}>
        <label className="sr-only" htmlFor="q">
          {t('entries.search')}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q ?? ''}
          placeholder={t('entries.search')}
          className={filterInputClass}
        />
        <label className="sr-only" htmlFor="eventId">
          {t('entries.allEvents')}
        </label>
        <select
          key={eventId ?? ''}
          id="eventId"
          name="eventId"
          defaultValue={eventId ?? ''}
          className={filterInputClass}
        >
          <option value="">{t('entries.allEvents')}</option>
          {tournament.events.map((e) => (
            <option key={e.id} value={e.id}>
              {eventLabel(e, locale)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="state">
          {t('entries.status')}
        </label>
        <select
          id="state"
          name="state"
          defaultValue={cancelled ? 'cancelled' : ''}
          className={filterInputClass}
        >
          <option value="">{t('entries.statusLive')}</option>
          <option value="cancelled">{t('entries.statusCancelled')}</option>
        </select>
        <Button type="submit" variant="outline">
          {t('filter')}
        </Button>
        {perPage !== PAGE_SIZE && <input type="hidden" name="perPage" value={perPage} />}
      </FilterBar>

      <PerPage
        current={perPage}
        href={sizeHref}
        summary={
          <>
            {q || cancelled ? (
              <p className="text-sm text-muted-foreground">
                {q
                  ? t('entries.found', { count: sorted.length, query: q })
                  : t('entries.summary', { count: sorted.length })}
              </p>
            ) : (
              <nav aria-label={t('entries.perEvent')} className="flex flex-wrap gap-2">
                {perEvent.map((e) => (
                  <Link
                    key={e.id}
                    href={`/admin/tournaments/${id}/entries?eventId=${e.id}`}
                    aria-current={eventId === e.id ? 'true' : undefined}
                    className={chip(eventId === e.id)}
                  >
                    {e.label} <strong className="tabular-nums">{e.teams}</strong>
                    {e.waiting > 0 && (
                      <span className="text-muted-foreground">
                        {' '}
                        {t('entries.plusWaiting', { count: e.waiting })}
                      </span>
                    )}
                  </Link>
                ))}
                <Link
                  href={`/admin/tournaments/${id}/entries`}
                  aria-current={!eventId ? 'true' : undefined}
                  className={chip(!eventId)}
                >
                  {t('entries.totalLabel')} <strong className="tabular-nums">{totalTeams}</strong>
                  {totalWaiting > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      {t('entries.plusWaiting', { count: totalWaiting })}
                    </span>
                  )}
                </Link>
              </nav>
            )}
          </>
        }
      />

      {entries.length === 0 ? (
        <p className="text-muted-foreground">{t('entries.noEntries')}</p>
      ) : (
        <ScrollRegion
          label={t('entries.title', { tournament: tournament.name })}
          className="rounded-lg border bg-card"
        >
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                {(
                  [
                    ['event', t('entries.event')],
                    ['player', t('entries.players')],
                    ['status', t('entries.status')],
                    ['payment', t('entries.payment')],
                    ['entered', t('entries.enteredOn')],
                  ] as const
                ).map(([column, label]) => (
                  <SortHeader
                    key={column}
                    column={column}
                    label={label}
                    current={sort ?? ''}
                    dir={dir}
                    href={sortHref}
                  />
                ))}
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{t('actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((r) => {
                const invite = r.invites[0];
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-3 font-medium">{eventLabel(r.event, locale)}</td>
                    <td className="px-3 py-3">
                      <ul className="space-y-1">
                        {r.participants.map((p) => (
                          <li key={p.player.memberNumber}>
                            <span className="font-medium">{personName(p.player)}</span>{' '}
                            <span className="text-muted-foreground">
                              {p.player.memberNumber}
                              {p.player.club && <> · {p.player.club.name}</>}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {p.player.user?.email ?? p.player.contactEmail}
                              {p.player.phone && <> · {p.player.phone}</>}
                            </span>
                          </li>
                        ))}
                        {invite && (
                          <li className="text-xs text-muted-foreground italic">
                            {t('entries.partnerOpen', {
                              name: invite.toPlayer
                                ? personName(invite.toPlayer)
                                : (invite.toEmail ?? ''),
                            })}
                          </li>
                        )}
                      </ul>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
                          r.status === 'CONFIRMED' && 'bg-primary text-primary-foreground',
                          r.status === 'WAITLISTED' && 'bg-brand text-brand-foreground',
                          r.status === 'CANCELLED' && 'bg-muted text-muted-foreground',
                        )}
                      >
                        {ts(r.status)}
                        {r.waitlistPosition ? ` #${r.waitlistPosition}` : ''}
                      </span>
                      {r.cancelReason && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {r.cancelReason}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {r.participants.map((p) => (
                        <span key={p.player.memberNumber} className="block whitespace-nowrap">
                          {tpay(p.paymentStatus)}
                          {p.paymentStatus === 'UNPAID' && r.status !== 'CANCELLED' && (
                            <form
                              action={markPaidAction.bind(null, locale, id, p.id)}
                              className="inline"
                            >
                              {' '}
                              <button
                                type="submit"
                                className="font-medium text-primary underline-offset-4 hover:underline"
                              >
                                {t('entries.markPaid')}
                              </button>
                            </form>
                          )}
                          {p.paymentStatus === 'UNPAID' && r.status !== 'CANCELLED' && (
                            // Paid at the desk with a discount code; the owner can waive (D111).
                            <details className="mt-1 whitespace-normal">
                              <summary className="cursor-pointer text-muted-foreground">
                                {t('entries.moreOptions')}
                              </summary>
                              <form
                                action={markPaidWithCodeAction.bind(null, locale, id, p.id)}
                                className="mt-1 flex items-center gap-1"
                              >
                                <input
                                  name="code"
                                  required
                                  maxLength={30}
                                  aria-label={t('entries.discountCode')}
                                  placeholder={t('entries.discountCode')}
                                  className="h-8 w-28 rounded-md border border-input bg-background px-2 text-base uppercase sm:text-xs"
                                />
                                <Button type="submit" size="sm" variant="outline" className="h-8">
                                  {t('entries.paidWithCode')}
                                </Button>
                              </form>
                              {isOwner && (
                                <QuickFormButton
                                  action={waiveShareAction.bind(null, locale, id, p.id, false)}
                                  confirm={t('entries.waiveConfirm')}
                                >
                                  {t('entries.waive')}
                                </QuickFormButton>
                              )}
                            </details>
                          )}
                          {p.paymentStatus === 'WAIVED' && p.waivedById && (
                            <>
                              {' '}
                              <span className="text-muted-foreground">
                                {formatEuro(p.waivedCents, locale)}
                              </span>
                              {isOwner && (
                                <QuickFormButton
                                  action={waiveShareAction.bind(null, locale, id, p.id, true)}
                                  confirm={t('entries.undoWaiveConfirm')}
                                >
                                  {t('entries.undoWaive')}
                                </QuickFormButton>
                              )}
                            </>
                          )}
                          {p.paymentStatus === 'PAID' && p.orderItems.length > 0 && (
                            // Paid at the desk by mistake: undo it, after a confirmation (D96).
                            <>
                              {' '}
                              <QuickButton
                                size="sm"
                                variant="link"
                                className="h-auto p-0 text-xs"
                                action={undoSharePaymentAction.bind(null, p.id)}
                                confirm={t('entries.undoPaidConfirm')}
                              >
                                {t('entries.undoPaid')}
                              </QuickButton>
                            </>
                          )}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
                      {format.dateTime(r.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-3">
                      {r.status !== 'CANCELLED' && (
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-destructive">
                            {t('entries.cancel')}
                          </summary>
                          <form
                            action={cancelEntryAction.bind(null, locale, id, r.id)}
                            className="mt-2 w-56 space-y-2"
                          >
                            <input
                              name="reason"
                              aria-label={t('entries.cancelReason')}
                              placeholder={t('entries.cancelReason')}
                              maxLength={500}
                              className={cn(filterInputClass, 'sm:w-full sm:min-w-0')}
                            />
                            <Button type="submit" size="sm" variant="destructive">
                              {t('entries.cancelConfirm')}
                            </Button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      <Pagination page={page} pages={pages} href={pageHref} />

      {/* Every cancellation with its undo, like the desk's check-in and food lists (D98). */}
      <section id="cancelled" aria-labelledby="cancelled-title" className="space-y-3">
        <div>
          <h2 id="cancelled-title" className="text-lg font-semibold">
            {t('entries.cancelledTitle', { count: cancelledEntries.length })}
          </h2>
          <p className="text-sm text-muted-foreground">{t('entries.cancelledIntro')}</p>
        </div>
        {cancelledEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('entries.noCancelled')}</p>
        ) : (
          <ScrollRegion
            label={t('entries.cancelledTitle', { count: cancelledEntries.length })}
            className="rounded-lg border bg-card opacity-90"
          >
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    {t('entries.event')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t('entries.players')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t('entries.colCancelled')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t('entries.colReason')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    {t('entries.colMoney')}
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">{t('entries.undoCancel')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cancelledEntries.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-3 py-3 font-medium">{eventLabel(c.event, locale)}</td>
                    <td className="px-3 py-3">
                      {c.players.map((p) => (
                        <span key={p.memberNumber} className="block">
                          {personName(p)}{' '}
                          <span className="text-xs text-muted-foreground">{p.memberNumber}</span>
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c.cancelledAt &&
                        format.dateTime(c.cancelledAt, { dateStyle: 'short', timeStyle: 'short' })}
                      <span className="block text-muted-foreground">
                        {c.by === 'player'
                          ? t('entries.byPlayer')
                          : c.by === 'expired'
                            ? t('entries.byExpired')
                            : c.byName
                              ? t('entries.byOrganiserName', { name: c.byName })
                              : t('entries.byOrganiser')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c.reason && c.reason !== 'holdExpired' ? c.reason : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c.refundPending
                        ? t('entries.refundOnWay')
                        : c.refundedCents > 0
                          ? t('entries.refundedAmount', {
                              amount: formatEuro(c.refundedCents, locale),
                            }) + (c.deskRefund ? ` · ${t('entries.deskPayBack')}` : '')
                          : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!c.refundPending && (
                        <QuickButton
                          size="sm"
                          variant="outline"
                          action={restoreEntryAction.bind(null, c.id)}
                          confirm={
                            t('entries.undoCancelConfirm') +
                            (c.outsideDraw ? ` ${t('entries.undoCancelDraw')}` : '')
                          }
                        >
                          {t('entries.undoCancel')}
                        </QuickButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </section>
    </>
  );
}
