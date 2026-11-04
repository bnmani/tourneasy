import type { Metadata } from 'next';
import { PerPage } from '@/components/admin/per-page';
import { PAGE_SIZE, pageSize } from '@/server/lib/validation';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuditTable } from '@/components/admin/audit-table';
import { PageHeader, Pagination } from '@/components/admin/ui';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { listTournamentAudit } from '@/server/services/admin-service';
import { getTournament } from '@/server/services/tournament-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.audit' });
  return { title: t('title'), robots: { index: false } };
}

/** One tournament's change log, for its organisers as well as admins. */
export default async function TournamentLogPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const query = await searchParams;
  const page = Number(firstParam(query.page) ?? '1') || 1;
  const perPage = pageSize(Number(firstParam(query.perPage)) || undefined);
  const sized = (n: number) => (n === PAGE_SIZE ? '' : `&perPage=${n}`);
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const result = await listTournamentAudit(actor, id, { page, perPage });
  const t = await getTranslations('Admin.audit');
  const tAdmin = await getTranslations('Admin');
  return (
    <>
      <PageHeader
        title={t('tournamentTitle', { tournament: tournament.name })}
        intro={t('tournamentIntro')}
      />
      <PerPage
        current={perPage}
        href={(n) => `/admin/tournaments/${id}/log?page=1${sized(n)}`}
        summary={tAdmin('total', { count: result.total })}
      />
      <AuditTable entries={result.entries} />
      <Pagination
        page={result.page}
        pages={result.pages}
        href={(p) => `/admin/tournaments/${id}/log?page=${p}${sized(perPage)}`}
      />
    </>
  );
}
