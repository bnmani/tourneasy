import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { VenueForm } from '@/components/admin/venue-club-forms';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';

export const metadata = { robots: { index: false } };

export default async function NewVenuePage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  await requireRole(locale, 'ADMIN');
  const t = await getTranslations('Admin.venues');
  return (
    <>
      <PageHeader title={t('new')} />
      <VenueForm locale={locale} venueId={null} values={{ country: 'NL' }} />
    </>
  );
}
