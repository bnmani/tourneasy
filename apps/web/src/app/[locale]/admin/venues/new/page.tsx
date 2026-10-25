import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { VenueForm } from '@/components/admin/venue-club-forms';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'venues.new');
}

export default async function NewVenuePage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  await requirePortal(locale);
  const t = await getTranslations('Admin.venues');
  return (
    <>
      <PageHeader title={t('new')} />
      <VenueForm locale={locale} venueId={null} values={{ country: 'NL' }} />
    </>
  );
}
