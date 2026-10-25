import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import type { LocalizedText } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { VenueForm } from '@/components/admin/venue-club-forms';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { archiveVenueAction } from '@/server/actions/admin-actions';
import { requirePortal } from '@/server/auth/web';
import { canEditVenue, getVenue } from '@/server/services/venue-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'venues.title');
}

type Params = { params: Promise<{ locale: string; id: string }> };
const nl = (v: unknown) => (v as LocalizedText | null)?.nl ?? '';

export default async function EditVenuePage({
  params,
  searchParams,
}: Params & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const venue = await getVenue(actor, id).catch(() => null);
  if (!venue) notFound();
  const editable = await canEditVenue(actor, venue.id);
  const t = await getTranslations('Admin');
  return (
    <>
      <PageHeader
        crumbs={[{ label: t('navVenues'), href: '/admin/venues' }, { label: venue.name }]}
        title={venue.name}
        actions={
          <>
            {actor.roles.includes('ADMIN') && (
              <form action={archiveVenueAction.bind(null, locale, venue.id, !venue.deletedAt)}>
                <Button type="submit" variant="outline">
                  {venue.deletedAt ? t('restore') : t('archive')}
                </Button>
              </form>
            )}
          </>
        }
      />
      {venue.deletedAt && <Badge tone="muted">{t('archived')}</Badge>}
      <StatusNotice status={firstParam((await searchParams).status)} />
      {!editable && (
        <p className="rounded-md border bg-secondary/40 px-4 py-3 text-sm">
          {t('venues.readOnly')}
        </p>
      )}
      <VenueForm
        disabled={!editable}
        locale={locale}
        venueId={venue.id}
        values={{
          name: venue.name,
          street: venue.street,
          houseNumber: venue.houseNumber,
          postcode: venue.postcode,
          city: venue.city,
          province: venue.province,
          country: venue.country,
          numberOfCourts: String(venue.numberOfCourts),
          latitude: venue.latitude?.toString() ?? '',
          longitude: venue.longitude?.toString() ?? '',
          phone: venue.phone ?? '',
          website: venue.website ?? '',
          facilities: nl(venue.facilities),
          parkingInfo: nl(venue.parkingInfo),
          publicTransportInfo: nl(venue.publicTransportInfo),
        }}
      />
    </>
  );
}
