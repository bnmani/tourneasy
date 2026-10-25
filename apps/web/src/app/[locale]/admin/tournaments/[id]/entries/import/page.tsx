import type { Metadata } from 'next';
import { adminMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ImportEntriesForm } from '@/components/admin/import-entries-form';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { pageLocale } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { ENTRY_IMPORT_COLUMNS } from '@/server/services/entry-import-service';
import { getTournament } from '@/server/services/tournament-service';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return adminMetadata(params, 'entries.import');
}

type Props = { params: Promise<{ locale: string; id: string }> };

/** Admin only: import participants into this tournament (D53). */
export default async function ImportEntriesPage({ params }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const t = await getTranslations('Admin');
  return (
    <>
      <PageHeader
        title={t('entries.importTitle', { tournament: tournament.name })}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/v1/admin/tournaments/${id}/entries/template`} download>
                {t('players.template')}
              </a>
            </Button>
          </>
        }
      />
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <ImportEntriesForm tournamentId={id} columns={[...ENTRY_IMPORT_COLUMNS]} />
      </div>
    </>
  );
}
