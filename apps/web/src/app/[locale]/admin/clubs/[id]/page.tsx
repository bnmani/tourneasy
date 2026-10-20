import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { ClubForm } from '@/components/admin/venue-club-forms';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { archiveClubAction } from '@/server/actions/admin-actions';
import { requireRole } from '@/server/auth/web';
import { getClub } from '@/server/services/club-service';
import { venueOptions } from '@/server/services/venue-service';

export const metadata = { robots: { index: false } };

type Params = { params: Promise<{ locale: string; id: string }> };

export default async function EditClubPage({
  params,
  searchParams,
}: Params & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requireRole(locale, 'ADMIN');
  const club = await getClub(actor, id).catch(() => null);
  if (!club) notFound();
  const t = await getTranslations('Admin');
  return (
    <>
      <PageHeader
        title={club.name}
        actions={
          <>
            <form action={archiveClubAction.bind(null, locale, club.id, !club.deletedAt)}>
              <Button type="submit" variant="outline">
                {club.deletedAt ? t('restore') : t('archive')}
              </Button>
            </form>
            <Button asChild variant="outline">
              <Link href="/admin/clubs">{t('back')}</Link>
            </Button>
          </>
        }
      />
      {club.deletedAt && <Badge tone="muted">{t('archived')}</Badge>}
      <StatusNotice status={firstParam((await searchParams).status)} />
      <ClubForm
        locale={locale}
        clubId={club.id}
        venues={await venueOptions()}
        values={{
          name: club.name,
          shortName: club.shortName ?? '',
          federationCode: club.federationCode ?? '',
          city: club.city ?? '',
          province: club.province ?? '',
          website: club.website ?? '',
          email: club.email ?? '',
          venueId: club.venueId ?? '',
        }}
      />
    </>
  );
}
