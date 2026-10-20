import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { ClubForm } from '@/components/admin/venue-club-forms';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { venueOptions } from '@/server/services/venue-service';

export const metadata = { robots: { index: false } };

export default async function NewClubPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin.clubs');
  return (
    <>
      <PageHeader title={t('new')} />
      <ClubForm locale={locale} clubId={null} values={{}} venues={await venueOptions()} />
    </>
  );
}
