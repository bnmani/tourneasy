import type { RegistrationStatus } from '@tourneasy/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AddEntryForm } from '@/components/admin/add-entry-form';
import { FilterBar, filterInputClass, PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { Link } from '@/i18n/navigation';
import { eventLabel, personName } from '@/lib/labels';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { markPaidAction } from '@/server/actions/payment-actions';
import { cancelEntryAction } from '@/server/actions/registration-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { listTournamentEntries } from '@/server/services/registration-service';
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
  const query = await searchParams;
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();

  const eventId = firstParam(query.eventId) || undefined;
  const cancelled = firstParam(query.state) === 'cancelled';
  const status: RegistrationStatus | undefined = cancelled ? 'CANCELLED' : undefined;
  const entries = await listTournamentEntries(actor, id, { eventId, status });

  const t = await getTranslations('Admin');
  const ts = await getTranslations('RegistrationStatuses');
  const tpay = await getTranslations('PaymentStatuses');
  const format = await getFormatter();
  const exportQuery = new URLSearchParams({
    ...(eventId ? { eventId } : {}),
    ...(status ? { status } : {}),
  });
  const confirmed = entries.filter(
    (e) => e.status === 'CONFIRMED' || e.status === 'PENDING',
  ).length;
  const waitlisted = entries.filter((e) => e.status === 'WAITLISTED').length;

  return (
    <>
      <PageHeader
        title={t('entries.title', { tournament: tournament.name })}
        intro={t('entries.intro')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/admin/tournaments/${id}`}>{t('back')}</Link>
            </Button>
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

      <details className="rounded-lg border bg-card p-4 sm:p-6" open={entries.length === 0}>
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
        <label className="sr-only" htmlFor="eventId">
          {t('entries.allEvents')}
        </label>
        <select
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
      </FilterBar>

      <p className="text-sm text-muted-foreground">
        {cancelled
          ? t('entries.summary', { count: entries.length })
          : t('entries.counts', { confirmed, waitlisted })}
      </p>

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
                <th scope="col" className="px-3 py-2">
                  {t('entries.event')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('entries.players')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('entries.status')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('entries.payment')}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t('entries.enteredOn')}
                </th>
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
    </>
  );
}
