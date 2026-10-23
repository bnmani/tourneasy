import { utcToAmsterdamLocal } from '@tourneasy/shared/rules';
import { STATUS_TRANSITIONS, type TournamentStatusCode } from '@tourneasy/shared/schemas';
import { centsToEuroInput, formatEuro, type LocalizedText } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OrganiserForm } from '@/components/admin/organiser-form';
import { TournamentForm } from '@/components/admin/tournament-form';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { FormSection } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import {
  deleteEventAction,
  publishTournamentAction,
  removeOrganiserAction,
  tournamentStatusAction,
} from '@/server/actions/admin-actions';
import { getActor, isPortalUser, requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { entryCounts } from '@/server/services/registration-service';
import { getTournament } from '@/server/services/tournament-service';
import { venueOptions } from '@/server/services/venue-service';
import { notFound } from 'next/navigation';

type Params = { params: Promise<{ locale: string; id: string }> };

async function load(id: string, actorPromise = getActor()) {
  const actor = await actorPromise;
  if (!actor) return null;
  return getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  await pageLocale(params);
  if (!isPortalUser(await getActor())) return { robots: { index: false } };
  const tournament = await load(id);
  return { title: tournament?.name, robots: { index: false } };
}

export default async function AdminTournamentPage({
  params,
  searchParams,
}: Params & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await load(id, Promise.resolve(actor));
  if (!tournament) notFound();
  const status = firstParam((await searchParams).status);

  const t = await getTranslations('Admin');
  const ts = await getTranslations('TournamentStatuses');
  const tt = await getTranslations('TournamentTypes');
  const td = await getTranslations('DrawTypes');
  const isAdmin = actor.roles.includes('ADMIN');
  const counts = await entryCounts(actor, tournament.id);
  const countOf = (status: string) =>
    counts.filter((c) => c.status === status).reduce((n, c) => n + c._count._all, 0);
  const confirmedEntries = countOf('CONFIRMED') + countOf('PENDING');
  const waitlistedEntries = countOf('WAITLISTED');
  const liveEntries = confirmedEntries + waitlistedEntries;
  const description = (tournament.description ?? null) as LocalizedText | null;
  const next = STATUS_TRANSITIONS[tournament.status as TournamentStatusCode];

  return (
    <>
      <PageHeader
        title={tournament.name}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/tournaments">{t('back')}</Link>
          </Button>
        }
      />
      <StatusNotice status={status} />

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('tournaments.status')}:</span>
          <Badge tone="primary">{ts(tournament.status)}</Badge>
          <Badge tone="muted">{tt(tournament.type)}</Badge>
          <Badge tone={tournament.isPublished ? 'primary' : 'muted'}>
            {tournament.isPublished ? t('tournaments.published') : t('tournaments.notPublished')}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {next.length > 0 && (
            <span className="text-sm text-muted-foreground">{t('tournaments.changeStatus')}</span>
          )}
          {next.map((s) => (
            <form key={s} action={tournamentStatusAction.bind(null, locale, tournament.id)}>
              <input type="hidden" name="status" value={s} />
              <Button type="submit" size="sm" variant="secondary">
                {ts(s)}
              </Button>
            </form>
          ))}
          <form
            action={publishTournamentAction.bind(
              null,
              locale,
              tournament.id,
              !tournament.isPublished,
            )}
          >
            <Button type="submit" size="sm" variant="outline">
              {tournament.isPublished ? t('tournaments.unpublish') : t('tournaments.publish')}
            </Button>
          </form>
        </div>
        <p className="text-sm text-muted-foreground">{t('tournaments.publishHint')}</p>
      </section>

      <section id="events" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('tournaments.events')}</h2>
            <p className="text-sm text-muted-foreground">{t('tournaments.eventsIntro')}</p>
          </div>
          <Button asChild>
            <Link href={`/admin/tournaments/${tournament.id}/events/new`}>
              {t('tournaments.addEvent')}
            </Link>
          </Button>
        </div>
        {tournament.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tournaments.noEvents')}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {tournament.events.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/tournaments/${tournament.id}/events/${e.id}`}
                    className="font-medium hover:underline"
                  >
                    {eventLabel(e, locale)}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatEuro(e.feeCents, locale)} · {td(e.drawType)} ·{' '}
                    {t('events.entries', { count: e._count.registrations })} (
                    {e.maxEntries
                      ? t('events.max', { count: e.maxEntries })
                      : t('events.unlimited')}
                    )
                  </p>
                </div>
                <div className="flex gap-2">
                  {!e.isOpen && <Badge tone="muted">{t('events.closed')}</Badge>}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/tournaments/${tournament.id}/events/${e.id}`}>
                      {t('edit')}
                    </Link>
                  </Button>
                  {e._count.registrations === 0 && (
                    <form action={deleteEventAction.bind(null, locale, tournament.id, e.id)}>
                      <Button type="submit" size="sm" variant="ghost">
                        {t('delete')}
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="organisers" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">{t('tournaments.organisers')}</h2>
          <p className="text-sm text-muted-foreground">{t('tournaments.organisersIntro')}</p>
        </div>
        {tournament.organisers.length === 0 && tournament.organiserInvites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tournaments.noOrganisers')}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {tournament.organisers.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 p-3">
                <span>
                  {o.user.name}{' '}
                  <span className="text-sm text-muted-foreground">({o.user.email})</span>
                </span>
                {isAdmin && (
                  <form action={removeOrganiserAction.bind(null, locale, tournament.id)}>
                    <input type="hidden" name="userId" value={o.user.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {t('tournaments.removeOrganiser')}
                    </Button>
                  </form>
                )}
              </li>
            ))}
            {tournament.organiserInvites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3">
                <span>
                  {i.email} <Badge tone="muted">{t('tournaments.pendingInvite')}</Badge>
                </span>
                {isAdmin && (
                  <form action={removeOrganiserAction.bind(null, locale, tournament.id)}>
                    <input type="hidden" name="inviteId" value={i.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {t('tournaments.removeOrganiser')}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && <OrganiserForm locale={locale} tournamentId={tournament.id} />}
      </section>

      <FormSection title={t('tournaments.members')}>
        <p className="text-sm text-muted-foreground">
          {t('entries.summary', { count: liveEntries })}
          {liveEntries > 0 && (
            <>
              {' · '}
              {t('entries.counts', { confirmed: confirmedEntries, waitlisted: waitlistedEntries })}
            </>
          )}
        </p>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/tournaments/${tournament.id}/entries`}>
              {t('entries.viewEntries')}
            </Link>
          </Button>
        </div>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/tournaments/${tournament.id}/draws`}>{t('draws.manage')}</Link>
          </Button>{' '}
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/tournaments/${tournament.id}/schedule`}>{t('schedule.title')}</Link>
          </Button>{' '}
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/tournaments/${tournament.id}/matches`}>{t('desk.title')}</Link>
          </Button>{' '}
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/tournaments/${tournament.id}/news`}>{t('news.title')}</Link>
          </Button>
        </div>
      </FormSection>

      <h2 className="pt-2 text-lg font-semibold">{t('edit')}</h2>
      <TournamentForm
        locale={locale}
        tournamentId={tournament.id}
        isAdmin={isAdmin}
        venues={await venueOptions()}
        values={{
          name: tournament.name,
          type: tournament.type,
          venueId: tournament.venueId ?? '',
          startsOn: tournament.startsOn.toISOString().slice(0, 10),
          endsOn: tournament.endsOn.toISOString().slice(0, 10),
          dayStartTime: tournament.dayStartTime ?? '',
          dayEndTime: tournament.dayEndTime ?? '',
          matchMinutes: tournament.matchMinutes.toString(),
          restMinutes: tournament.restMinutes.toString(),
          registrationOpensAt: utcToAmsterdamLocal(tournament.registrationOpensAt),
          registrationClosesAt: utcToAmsterdamLocal(tournament.registrationClosesAt),
          withdrawalDeadline: utcToAmsterdamLocal(tournament.withdrawalDeadline),
          maxParticipants: tournament.maxParticipants?.toString() ?? '',
          maxEventsPerPlayer: tournament.maxEventsPerPlayer.toString(),
          courtsAvailable: tournament.courtsAvailable?.toString() ?? '',
          contactName: tournament.contactName ?? '',
          contactEmail: tournament.contactEmail ?? '',
          contactPhone: tournament.contactPhone ?? '',
          descriptionNl: description?.nl ?? '',
          descriptionEn: description?.en ?? '',
          partnerPaymentMode:
            tournament.partnerPaymentMode === 'INITIATOR_PAYS_ALL'
              ? 'INITIATOR_PAYS_ALL'
              : 'EACH_PAYS_OWN_SHARE',
          refundPolicy: tournament.refundPolicy,
          refundPercent: tournament.refundPercent.toString(),
          bundlePrices: tournament.bundlePricesCents.map(centsToEuroInput),
        }}
      />
    </>
  );
}
