import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TournamentForm } from '@/components/admin/tournament-form';
import { PageHeader } from '@/components/admin/ui';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { getActor, isPortalUser, requireRole } from '@/server/auth/web';
import { venueOptions } from '@/server/services/venue-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  if (!isPortalUser(await getActor())) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: 'Admin.tournaments' });
  return { title: t('new'), robots: { index: false } };
}

export default async function NewTournamentPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  // Creating tournaments is reserved for the site's admins.
  await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin.tournaments');
  return (
    <>
      <PageHeader title={t('new')} />
      <TournamentForm
        locale={locale}
        tournamentId={null}
        values={{ type: 'SELF', maxEventsPerPlayer: '3', dayStartTime: '09:00' }}
        venues={await venueOptions()}
        isAdmin
      />
    </>
  );
}
