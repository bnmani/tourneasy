import type { OrderStatus } from '@tourneasy/db';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FilterBar, filterInputClass, PageHeader, StatusNotice } from '@/components/admin/ui';
import { PaymentsView } from '@/components/admin/payments-view';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import { paymentsOverview, paymentTournamentOptions } from '@/server/services/payment-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.payments' });
  return { title: t('title'), robots: { index: false } };
}

const STATUSES: OrderStatus[] = ['PAID', 'PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'EXPIRED'];

/** Admin: money in and out (D51): totals, refund requests to decide, orders, Excel export. */
export default async function PaymentsPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'ADMIN');
  const query = await searchParams;
  const tournamentId = firstParam(query.tournamentId) || undefined;
  const statusParam = firstParam(query.state);
  const status = STATUSES.includes(statusParam as OrderStatus)
    ? (statusParam as OrderStatus)
    : undefined;
  const page = Number(firstParam(query.page) ?? '1') || 1;
  const [overview, tournaments] = await Promise.all([
    paymentsOverview(actor, { tournamentId, status, page }),
    paymentTournamentOptions(actor),
  ]);

  const t = await getTranslations('Admin');
  const tp = await getTranslations('Admin.payments');
  const to = await getTranslations('OrderStatuses');
  const filterQuery = [
    ...(tournamentId ? [['tournamentId', tournamentId]] : []),
    ...(status ? [['state', status]] : []),
  ];
  const href = (p: number) =>
    `/admin/payments?${new URLSearchParams([...filterQuery, ['page', String(p)]])}`;
  const exportQuery = new URLSearchParams([
    ...(tournamentId ? [['tournamentId', tournamentId]] : []),
    ...(status ? [['status', status]] : []),
  ]);

  return (
    <>
      <PageHeader
        title={tp('title')}
        intro={tp('intro')}
        actions={
          <>
            {actor.roles.includes('OWNER') && (
              <Button asChild variant="outline">
                <Link href="/admin/payments/settings">{tp('settings')}</Link>
              </Button>
            )}
            {actor.roles.includes('OWNER') && (
              <Button asChild>
                <a href={`/api/v1/admin/payments/export?${exportQuery}`} download>
                  {tp('export')}
                </a>
              </Button>
            )}
          </>
        }
      />
      <StatusNotice status={firstParam(query.status)} />

      <FilterBar action={`/${locale}/admin/payments`}>
        <label className="sr-only" htmlFor="tournamentId">
          {tp('allTournaments')}
        </label>
        <select
          id="tournamentId"
          name="tournamentId"
          defaultValue={tournamentId ?? ''}
          className={filterInputClass}
        >
          <option value="">{tp('allTournaments')}</option>
          {tournaments.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="state">
          {tp('status')}
        </label>
        <select id="state" name="state" defaultValue={status ?? ''} className={filterInputClass}>
          <option value="">{tp('allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {to(s)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t('filter')}
        </Button>
      </FilterBar>

      <PaymentsView locale={locale} overview={overview} href={href} canDecide />
    </>
  );
}
