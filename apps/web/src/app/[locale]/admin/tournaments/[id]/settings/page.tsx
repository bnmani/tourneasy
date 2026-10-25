import { utcToAmsterdamLocal } from '@tourneasy/shared/rules';
import { centsToEuroInput, type LocalizedText } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { OrganiserForm } from '@/components/admin/organiser-form';
import { TournamentForm } from '@/components/admin/tournament-form';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import {
  removeOrganiserAction,
  removeTournamentLogoAction,
  uploadTournamentLogoAction,
} from '@/server/actions/admin-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { tournamentLogo } from '@/server/services/logo-service';
import { getTournament } from '@/server/services/tournament-service';
import { venueOptions } from '@/server/services/venue-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.tournaments' });
  return { title: t('settingsLink'), robots: { index: false } };
}

/** A tournament's settings: details, logo and organisers; the overview keeps the progress. */
export default async function TournamentSettingsPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const status = firstParam((await searchParams).status);
  const t = await getTranslations('Admin');
  const isAdmin = actor.roles.includes('ADMIN');
  const logo = await tournamentLogo(tournament.id);
  const description = (tournament.description ?? null) as LocalizedText | null;

  return (
    <>
      <PageHeader
        title={t('tournaments.settingsTitle', { tournament: tournament.name })}
        intro={t('tournaments.settingsIntro')}
      />
      <StatusNotice status={status} />

      <section
        id="logo"
        aria-labelledby="logo-title"
        className="space-y-3 rounded-lg border bg-card p-4 sm:p-6"
      >
        <h2 id="logo-title" className="text-lg font-semibold">
          {t('tournaments.logoTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('tournaments.logoIntro')}</p>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own endpoint
          <img
            src={logo.url}
            alt={t('tournaments.logoAlt', { tournament: tournament.name })}
            width={Math.round((logo.width / logo.height) * 64)}
            height={64}
            className="h-16 w-auto max-w-full rounded border bg-white object-contain p-1"
          />
        ) : (
          <p className="text-sm">{t('tournaments.logoNone')}</p>
        )}
        <form
          action={uploadTournamentLogoAction.bind(null, locale, tournament.id)}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-sm">
            <span className="block font-medium">{t('tournaments.logoFile')}</span>
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg"
              required
              aria-describedby="logo-hint"
              className="mt-1 block text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-2 file:text-sm"
            />
          </label>
          <Button type="submit" variant="outline">
            {logo ? t('tournaments.logoReplace') : t('tournaments.logoUpload')}
          </Button>
        </form>
        <p id="logo-hint" className="text-sm text-muted-foreground">
          {t('tournaments.logoHint')}
        </p>
        {logo && (
          <form action={removeTournamentLogoAction.bind(null, locale, tournament.id)}>
            <Button type="submit" size="sm" variant="ghost" className="text-destructive">
              {t('tournaments.logoRemove')}
            </Button>
          </form>
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

      <h2 id="edit" className="pt-2 text-lg font-semibold">
        {t('tournaments.details')}
      </h2>
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
          singleGameMinutes: tournament.singleGameMinutes.toString(),
          noShowMinutes: tournament.noShowMinutes.toString(),
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
