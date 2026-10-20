import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MergePlayerForm, PlayerForm } from '@/components/admin/player-forms';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { FormSection } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { personName } from '@/lib/labels';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { getPlayer } from '@/server/services/player-service';
import { getProfileOptions } from '@/server/services/profile-service';

export const metadata = { robots: { index: false } };

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
  const status = firstParam((await searchParams).status);

  return (
    <>
      <PageHeader
        title={personName(player)}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/players">{t('back')}</Link>
          </Button>
        }
      />
      <StatusNotice status={status} />
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
