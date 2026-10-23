import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EventForm } from '@/components/admin/event-form';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { eventOptions } from '@/server/services/event-service';
import { getTournament } from '@/server/services/tournament-service';

type Params = { params: Promise<{ locale: string; id: string }> };

export const metadata = { robots: { index: false } };

export default async function NewEventPage({ params }: Params) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await getTournament(actor, id).catch(() => null);
  if (!tournament) notFound();
  const t = await getTranslations('Admin');
  return (
    <>
      <PageHeader
        title={`${t('events.new')} · ${tournament.name}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/tournaments/${id}#events`}>{t('back')}</Link>
          </Button>
        }
      />
      <EventForm
        locale={locale}
        tournamentId={id}
        eventId={null}
        options={await eventOptions()}
        values={{
          discipline: '',
          ageCategoryId: '',
          levelClassId: '',
          nameNl: '',
          nameEn: '',
          fee: '',
          maxEntries: '',
          drawType: 'KNOCKOUT',
          groupSize: '4',
          advancePerGroup: '2',
          matchesPerEntry: '5',
          knockoutSize: '16',
          bestOf: '3',
          pointsToWin: '21',
          pointsCap: '30',
          restMinutes: '',
          koScoringFrom: '',
          koBestOf: '3',
          koPointsToWin: '21',
          koPointsCap: '30',
          isOpen: true,
        }}
      />
    </>
  );
}
