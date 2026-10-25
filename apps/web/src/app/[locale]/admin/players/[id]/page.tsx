import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MergePlayerForm, PlayerForm } from '@/components/admin/player-forms';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { FormSection } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { personName } from '@/lib/labels';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { invitePlayersAction } from '@/server/actions/admin-actions';
import { lastInvites } from '@/server/services/player-invite-service';
import { getPlayer } from '@/server/services/player-service';
import { getProfileOptions } from '@/server/services/profile-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'players.detailTitle');
}

type Params = { params: Promise<{ locale: string; id: string }> };

export default async function AdminPlayerPage({
  params,
  searchParams,
}: Params & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requireRole(locale, 'ADMIN');
  const player = await getPlayer(actor, id).catch(() => null);
  if (!player) notFound();
  const t = await getTranslations('Admin');
  const tr = await getTranslations('Roles');
  const format = await getFormatter();
  const query = await searchParams;
  const status = firstParam(query.status);
  const lastInvite = player.user ? undefined : (await lastInvites([player.id])).get(player.id);

  return (
    <>
      <PageHeader
        crumbs={[{ label: t('navPlayers'), href: '/admin/players' }, { label: personName(player) }]}
        title={personName(player)}
      />
      <StatusNotice
        status={status}
        params={{ sent: firstParam(query.sent) ?? '0', skipped: firstParam(query.skipped) ?? '0' }}
      />
      <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4 text-sm">
        <span>
          {t('players.memberNumber')}: <strong>{player.memberNumber}</strong>
        </span>
        <span className="text-muted-foreground">
          · {t('players.registeredOn')} {format.dateTime(player.createdAt, { dateStyle: 'medium' })}
        </span>
        {player.user ? (
          <>
            <Badge>{t('players.withAccount')}</Badge>
            {player.user.roles
              .filter((r) => r.role !== 'PLAYER')
              .map((r) => (
                <Badge key={r.role} tone="primary">
                  {tr(r.role)}
                </Badge>
              ))}
          </>
        ) : (
          <Badge tone="muted">{t('players.withoutAccount')}</Badge>
        )}
        {player.isMinor && <Badge tone="muted">{t('players.minor')}</Badge>}
        {player.mergedInto && (
          <Badge tone="muted">
            {t('players.mergedInto', { number: player.mergedInto.memberNumber })}
          </Badge>
        )}
      </section>
      {!player.user && (
        <section
          aria-labelledby="invite-title"
          className="space-y-2 rounded-lg border bg-card p-4 text-sm"
        >
          <h2 id="invite-title" className="font-semibold">
            {t('players.invite.inviteTitle')}
          </h2>
          {player.contactEmail ? (
            <form action={invitePlayersAction.bind(null, locale)} className="space-y-2">
              <input type="hidden" name="ids" value={player.id} />
              <input
                type="hidden"
                name="returnTo"
                value={`/${locale}/admin/players/${player.id}`}
              />
              <p className="text-muted-foreground">
                {t('players.invite.inviteText', { email: player.contactEmail })}
              </p>
              {lastInvite && (
                <p className="text-muted-foreground">
                  {t('players.invite.inviteLast', {
                    date: format.dateTime(lastInvite, { dateStyle: 'medium', timeStyle: 'short' }),
                  })}
                </p>
              )}
              <Button type="submit" size="sm">
                {lastInvite ? t('players.invite.inviteResend') : t('players.invite.inviteSend')}
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground">{t('players.invite.inviteNoEmail')}</p>
          )}
        </section>
      )}
      {player.isMinor && (
        <p className="text-sm text-muted-foreground">{t('players.minorNotice')}</p>
      )}

      <PlayerForm
        locale={locale}
        playerId={player.id}
        options={await getProfileOptions()}
        accountEmail={player.user?.email ?? null}
        values={{
          firstName: player.firstName,
          lastNamePrefix: player.lastNamePrefix ?? '',
          lastName: player.lastName,
          contactEmail: player.contactEmail ?? '',
          phone: player.phone ?? '',
          dateOfBirth: player.dateOfBirth.toISOString().slice(0, 10),
          gender: player.gender,
          nationality: player.nationality ?? '',
          clubId: player.clubId ?? '',
          federationId: player.federationId ?? '',
          levelSinglesId: player.levelSinglesId ?? '',
          levelDoublesId: player.levelDoublesId ?? '',
          levelMixedId: player.levelMixedId ?? '',
          preferredDisciplines: player.preferredDisciplines,
        }}
      />

      <FormSection title={t('players.history')}>
        <p className="text-sm text-muted-foreground">{t('players.historySoon')}</p>
      </FormSection>

      {!player.deletedAt && (
        <FormSection title={t('players.merge')}>
          <MergePlayerForm locale={locale} sourceId={player.id} />
        </FormSection>
      )}
    </>
  );
}
