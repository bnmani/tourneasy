import { STATUS_TRANSITIONS, type TournamentStatusCode } from '@tourneasy/shared/schemas';
import { formatDate, formatEuro } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { FormSection } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { eventLabel } from '@/lib/labels';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import {
  deleteEventAction,
  publishTournamentAction,
  tournamentStatusAction,
} from '@/server/actions/admin-actions';
import { getActor, isPortalUser, requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { setupChecklist } from '@/server/services/progress-service';
import { SetupChecklist } from '@/components/admin/setup-checklist';
import { entryCounts } from '@/server/services/registration-service';
import { getTournament, tournamentOver } from '@/server/services/tournament-service';
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
  const counts = await entryCounts(actor, tournament.id);
  const setup = await setupChecklist(actor, tournament.id);
  const countOf = (status: string) =>
    counts.filter((c) => c.status === status).reduce((n, c) => n + c._count._all, 0);
  const confirmedEntries = countOf('CONFIRMED') + countOf('PENDING');
  const waitlistedEntries = countOf('WAITLISTED');
  const liveEntries = confirmedEntries + waitlistedEntries;
  const next = STATUS_TRANSITIONS[tournament.status as TournamentStatusCode];
  // Archiving only after the last day (D86); before that the button isn't offered.
  const over = tournamentOver(tournament.endsOn);

  return (
    <>
      <PageHeader title={tournament.name} />
      <StatusNotice status={status} />

      <SetupChecklist steps={setup.steps} next={setup.next} />

      <section id="status" className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
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
          {next
            .filter((s) => s !== 'ARCHIVED' || over)
            .map((s) => (
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
        {next.includes('ARCHIVED') && !over && (
          <p className="text-sm text-muted-foreground">
            {t('tournaments.archiveAfter', {
              date: formatDate(new Date(tournament.endsOn.getTime() + 86_400_000), locale),
            })}
          </p>
        )}
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
      </FormSection>
    </>
  );
}
