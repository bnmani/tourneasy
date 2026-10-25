import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PaymentsView } from '@/components/admin/payments-view';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { paymentsOverview } from '@/server/services/payment-service';
import { getTournament } from '@/server/services/tournament-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.payments' });
  return { title: t('title'), robots: { index: false } };
}

/** One tournament's payments (D75): for its organisers as well as admins. */
export default async function TournamentPaymentsPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const query = await searchParams;
  const page = Number(firstParam(query.page) ?? '1') || 1;
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const overview = await paymentsOverview(actor, { tournamentId: id, page });
  const tp = await getTranslations('Admin.payments');
  return (
    <>
      <PageHeader
        title={tp('tournamentTitle', { tournament: tournament.name })}
        intro={tp('tournamentIntro')}
        actions={
          <Button asChild>
            <a href={`/api/v1/admin/payments/export?tournamentId=${id}`} download>
              {tp('export')}
            </a>
          </Button>
        }
      />
      <StatusNotice status={firstParam(query.status)} />
      <PaymentsView
        locale={locale}
        overview={overview}
        href={(p) => `/admin/tournaments/${id}/payments?page=${p}`}
        canDecide={actor.roles.includes('ADMIN')}
      />
    </>
  );
}
