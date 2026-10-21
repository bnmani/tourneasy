import { formatDate, formatDayRange, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import {
  invitePartnerAction,
  respondInviteAction,
  withdrawAction,
} from '@/server/actions/registration-actions';
import type { listMyInvites, listMyRegistrations } from '@/server/services/registration-service';

type Entry = Awaited<ReturnType<typeof listMyRegistrations>>[number];
type Invite = Awaited<ReturnType<typeof listMyInvites>>[number];

const day = (d: Date) => d.toISOString().slice(0, 10);
const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Invitations from partners, shown above my entries. */
export async function MyInvites({ invites, locale }: { invites: Invite[]; locale: AppLocale }) {
  if (invites.length === 0) return null;
  const t = await getTranslations('Dashboard');
  return (
    <section
      aria-labelledby="invites-title"
      className="rounded-lg border border-primary/40 bg-secondary/60 p-5"
    >
      <h2 id="invites-title" className="font-heading text-lg font-semibold">
        {t('invitesTitle')}
      </h2>
      <ul className="mt-3 space-y-3">
        {invites.map((i) => (
          <li
            key={i.id}
            className="flex flex-col gap-3 rounded-md bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">
                {t('inviteFrom', { name: i.from, event: eventLabel(i.event, locale) })}
              </p>
              <p className="text-sm text-muted-foreground">
                {i.tournament.name} ·{' '}
                {formatDayRange(day(i.tournament.startsOn), day(i.tournament.endsOn), locale)}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={respondInviteAction.bind(null, locale, { id: i.id }, true)}>
                <Button type="submit" size="sm">
                  {t('accept')}
                </Button>
              </form>
              <form action={respondInviteAction.bind(null, locale, { id: i.id }, false)}>
                <Button type="submit" size="sm" variant="outline">
                  {t('decline')}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** My entries grouped per tournament, with partner, status, payment and actions. */
export async function MyEntries({
  entries,
  locale,
  showActions,
}: {
  entries: Entry[];
  locale: AppLocale;
  showActions: boolean;
}) {
  const t = await getTranslations('Dashboard');
  const ts = await getTranslations('RegistrationStatuses');
  const tpay = await getTranslations('PaymentStatuses');
  const groups = new Map<string, Entry[]>();
  for (const e of entries)
    groups.set(e.tournament.slug, [...(groups.get(e.tournament.slug) ?? []), e]);

  return (
    <div className="space-y-6">
      {[...groups.values()].map((group) => {
        const tournament = group[0]!.tournament;
        return (
          <section key={tournament.slug} className="rounded-lg border">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/50 px-4 py-3">
              <h3 className="font-heading text-lg font-semibold">
                <Link
                  href={`/tournaments/${tournament.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {tournament.name}
                </Link>
              </h3>
              <span className="text-sm text-muted-foreground">
                {formatDayRange(day(tournament.startsOn), day(tournament.endsOn), locale)}
              </span>
            </header>
            <ul className="divide-y">
              {group.map((e) => (
                <li key={e.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{eventLabel(e.event, locale)}</p>
                      {e.doubles && (
                        <p className="text-sm text-muted-foreground">
                          {t('partner')}:{' '}
                          {e.partner
                            ? `${e.partner.name} (${e.partner.memberNumber})`
                            : e.pendingInvite
                              ? t('partnerPending', { name: e.pendingInvite.to })
                              : e.lookingForPartner
                                ? t('partnerLooking')
                                : t('partnerNone')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5',
                          e.status === 'CONFIRMED'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-brand text-brand-foreground',
                        )}
                      >
                        {e.status === 'WAITLISTED'
                          ? t('waitlist', { position: e.waitlistPosition ?? 0 })
                          : ts(e.status)}
                      </span>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                        {tpay(e.paymentStatus)}
                      </span>
                    </div>
                  </div>

                  {showActions && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      {e.doubles && !e.partner && e.myRole === 'PRIMARY' && (
                        <form
                          action={invitePartnerAction.bind(null, locale, e.id)}
                          className="flex flex-1 gap-2"
                        >
                          <label className="sr-only" htmlFor={`partner-${e.id}`}>
                            {e.pendingInvite ? t('inviteOther') : t('invitePartner')}
                          </label>
                          <input
                            id={`partner-${e.id}`}
                            name="partner"
                            placeholder={e.pendingInvite ? t('inviteOther') : t('invitePartner')}
                            autoComplete="off"
                            className={inputClass}
                          />
                          <Button type="submit" size="sm" variant="outline" className="h-10">
                            {t('invite')}
                          </Button>
                        </form>
                      )}
                      {e.canWithdraw ? (
                        <details className="group sm:ml-auto">
                          <summary className="cursor-pointer text-sm font-medium text-destructive underline-offset-4 hover:underline">
                            {t('withdraw')}
                          </summary>
                          <form
                            action={withdrawAction.bind(null, locale, e.id)}
                            className="mt-2 space-y-2 rounded-md border p-3"
                          >
                            <p className="text-xs text-muted-foreground">
                              {t('withdrawUntil', {
                                date: `${formatDate(e.withdrawalDeadline, locale)}, ${formatTime(e.withdrawalDeadline, locale)}`,
                              })}
                            </p>
                            <label className="sr-only" htmlFor={`reason-${e.id}`}>
                              {t('withdrawReason')}
                            </label>
                            <input
                              id={`reason-${e.id}`}
                              name="reason"
                              placeholder={t('withdrawReason')}
                              maxLength={500}
                              className={inputClass}
                            />
                            <Button type="submit" size="sm" variant="destructive">
                              {t('withdrawConfirm')}
                            </Button>
                          </form>
                        </details>
                      ) : (
                        <p className="text-xs text-muted-foreground sm:ml-auto">
                          {t('withdrawClosedNote')}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
