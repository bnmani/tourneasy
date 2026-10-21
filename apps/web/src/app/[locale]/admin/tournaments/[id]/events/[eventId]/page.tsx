import { centsToEuroInput } from '@tourneasy/shared/rules';
import type { LocalizedText } from '@tourneasy/shared/i18n';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EventForm } from '@/components/admin/event-form';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { eventOptions, getEvent } from '@/server/services/event-service';

type Params = { params: Promise<{ locale: string; id: string; eventId: string }> };

export const metadata = { robots: { index: false } };

export default async function EditEventPage({ params }: Params) {
  const locale = await pageLocale(params);
  const { id, eventId } = await params;
  const actor = await requirePortal(locale);
  const event = await getEvent(actor, id, eventId).catch(() => null);
  if (!event) notFound();
  const t = await getTranslations('Admin');
  const name = (event.name ?? null) as LocalizedText | null;
  return (
    <>
      <PageHeader
        title={t('events.edit')}
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/tournaments/${id}#events`}>{t('back')}</Link>
          </Button>
        }
      />
      <EventForm
        locale={locale}
        tournamentId={id}
        eventId={eventId}
        options={await eventOptions()}
        values={{
          discipline: event.discipline,
          ageCategoryId: event.ageCategoryId ?? '',
          levelClassId: event.levelClassId ?? '',
          nameNl: name?.nl ?? '',
          nameEn: name?.en ?? '',
          fee: centsToEuroInput(event.feeCents),
          maxEntries: event.maxEntries?.toString() ?? '',
          drawType: event.drawType,
          groupSize: event.groupSize?.toString() ?? '4',
          advancePerGroup: event.advancePerGroup?.toString() ?? '2',
          matchesPerEntry: event.matchesPerEntry?.toString() ?? '5',
          knockoutSize: event.knockoutSize?.toString() ?? '16',
          bestOf: event.bestOf.toString(),
          pointsToWin: event.pointsToWin.toString(),
          pointsCap: event.pointsCap.toString(),
          restMinutes: event.restMinutes?.toString() ?? '',
          isOpen: event.isOpen,
        }}
      />
    </>
  );
}
